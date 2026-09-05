-- FO Star Redeem (Starbucks-style): temporary redeem sessions, FO confirm, history without voucher_codes.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.star_redeem_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  completed_at timestamptz NULL,
  validated_by uuid NULL REFERENCES public.profiles (user_id) ON DELETE SET NULL,
  CONSTRAINT star_redeem_sessions_status_check CHECK (status IN ('open', 'closed', 'completed')),
  CONSTRAINT star_redeem_sessions_code_format CHECK (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  CONSTRAINT star_redeem_sessions_code_uidx UNIQUE (code)
);

CREATE UNIQUE INDEX IF NOT EXISTS star_redeem_sessions_one_open_per_user
  ON public.star_redeem_sessions (user_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS star_redeem_sessions_status_idx
  ON public.star_redeem_sessions (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS star_redeem_sessions_open_created_idx
  ON public.star_redeem_sessions (created_at DESC)
  WHERE status = 'open';

COMMENT ON TABLE public.star_redeem_sessions IS
  'Session redeem Star sementara. Muncul di antrian FO hanya saat status=open dan heartbeat masih hidup.';

CREATE TABLE IF NOT EXISTS public.star_voucher_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  voucher_id uuid NULL REFERENCES public.vouchers (id) ON DELETE SET NULL,
  session_id uuid NULL REFERENCES public.star_redeem_sessions (id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NULL,
  how_to_get text NULL,
  how_to_use text NULL,
  terms_and_conditions text NULL,
  star_cost integer NOT NULL CHECK (star_cost > 0),
  image_url text NULL,
  bg_color text NULL,
  status text NOT NULL DEFAULT 'used',
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by uuid NULL REFERENCES public.profiles (user_id) ON DELETE SET NULL,
  CONSTRAINT star_voucher_redemptions_status_check CHECK (status = 'used')
);

CREATE INDEX IF NOT EXISTS star_voucher_redemptions_user_idx
  ON public.star_voucher_redemptions (user_id, redeemed_at DESC);

COMMENT ON TABLE public.star_voucher_redemptions IS
  'History Voucher Saya dari penukaran FO. Snapshot metadata; langsung status used; tanpa voucher_codes.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.star_redeem_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_voucher_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Star redeem sessions owner select" ON public.star_redeem_sessions;
CREATE POLICY "Star redeem sessions owner select"
  ON public.star_redeem_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Star redeem sessions owner insert" ON public.star_redeem_sessions;
CREATE POLICY "Star redeem sessions owner insert"
  ON public.star_redeem_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Star redeem sessions owner update" ON public.star_redeem_sessions;
CREATE POLICY "Star redeem sessions owner update"
  ON public.star_redeem_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Star voucher redemptions owner select" ON public.star_voucher_redemptions;
CREATE POLICY "Star voucher redemptions owner select"
  ON public.star_voucher_redemptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Star voucher redemptions superadmin insert" ON public.star_voucher_redemptions;
CREATE POLICY "Star voucher redemptions superadmin insert"
  ON public.star_voucher_redemptions FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.star_redeem_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_star_redeem_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  result text;
  i int;
BEGIN
  bytes := extensions.gen_random_bytes(8);
  result := '';
  FOR i IN 0..7 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public._normalize_star_redeem_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.sweep_stale_star_redeem_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.star_redeem_sessions
  SET
    status = 'closed',
    closed_at = now()
  WHERE status = 'open'
    AND last_seen_at < now() - interval '30 seconds';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_stale_star_redeem_sessions()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Disable self-redeem
-- ---------------------------------------------------------------------------

-- DROP dulu: CREATE OR REPLACE tidak boleh mengubah return type fungsi existing.
DROP FUNCTION IF EXISTS public.redeem_voucher_with_stars(uuid, uuid);

CREATE OR REPLACE FUNCTION public.redeem_voucher_with_stars(
  p_user_id uuid,
  p_voucher_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION
    'Penukaran Star hanya melalui Front Office. Buka bagian Redeem di aplikasi lalu tunjukkan kode ke kasir.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_voucher_with_stars(uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Mobile RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_star_redeem_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session public.star_redeem_sessions%ROWTYPE;
  v_code text;
  v_attempts int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'Profil tidak ditemukan';
  END IF;

  PERFORM public.sweep_stale_star_redeem_sessions();

  UPDATE public.star_redeem_sessions
  SET
    status = 'closed',
    closed_at = now()
  WHERE user_id = v_user
    AND status = 'open';

  LOOP
    v_attempts := v_attempts + 1;
    v_code := public.generate_star_redeem_code();
    BEGIN
      INSERT INTO public.star_redeem_sessions (user_id, code, status, last_seen_at)
      VALUES (v_user, v_code, 'open', now())
      RETURNING * INTO v_session;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 20 THEN
        RAISE EXCEPTION 'Gagal membuat kode redeem. Coba lagi.';
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'code', v_session.code,
    'status', v_session.status,
    'created_at', v_session.created_at,
    'last_seen_at', v_session.last_seen_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_star_redeem_session()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.heartbeat_star_redeem_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session public.star_redeem_sessions%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.sweep_stale_star_redeem_sessions();

  SELECT * INTO v_session
  FROM public.star_redeem_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session tidak ditemukan';
  END IF;

  IF v_session.user_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Session sudah ditutup';
  END IF;

  UPDATE public.star_redeem_sessions
  SET last_seen_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'status', v_session.status,
    'last_seen_at', v_session.last_seen_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat_star_redeem_session(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_star_redeem_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session public.star_redeem_sessions%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_session
  FROM public.star_redeem_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session tidak ditemukan';
  END IF;

  IF v_session.user_id IS DISTINCT FROM v_user
     AND NOT public.is_superadmin(v_user)
  THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_session.status = 'completed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'session_id', v_session.id,
      'status', v_session.status
    );
  END IF;

  IF v_session.status = 'closed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'session_id', v_session.id,
      'status', v_session.status
    );
  END IF;

  UPDATE public.star_redeem_sessions
  SET
    status = 'closed',
    closed_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'status', v_session.status,
    'closed_at', v_session.closed_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_star_redeem_session(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_my_star_voucher_redemptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
STABLE
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(row_data ORDER BY redeemed_at DESC)
      FROM (
        SELECT
          jsonb_build_object(
            'id', r.id,
            'voucher_id', r.voucher_id,
            'name', r.name,
            'description', r.description,
            'how_to_get', r.how_to_get,
            'how_to_use', r.how_to_use,
            'terms_and_conditions', r.terms_and_conditions,
            'star_cost', r.star_cost,
            'image_url', r.image_url,
            'bg_color', r.bg_color,
            'status', r.status,
            'redeemed_at', r.redeemed_at
          ) AS row_data,
          r.redeemed_at
        FROM public.star_voucher_redemptions r
        WHERE r.user_id = v_user
      ) t
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_star_voucher_redemptions()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_open_star_redeem_sessions(p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF p_actor_user_id IS NULL OR NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.sweep_stale_star_redeem_sessions();

  RETURN coalesce(
    (
      SELECT jsonb_agg(row_data ORDER BY created_at ASC)
      FROM (
        SELECT
          jsonb_build_object(
            'id', s.id,
            'user_id', s.user_id,
            'code', s.code,
            'status', s.status,
            'created_at', s.created_at,
            'last_seen_at', s.last_seen_at,
            'display_name', p.display_name,
            'username', p.username,
            'avatar_url', p.avatar_url,
            'coins', p.coins
          ) AS row_data,
          s.created_at
        FROM public.star_redeem_sessions s
        JOIN public.profiles p ON p.user_id = s.user_id
        WHERE s.status = 'open'
      ) t
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_open_star_redeem_sessions(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_star_redeem_code(
  p_actor_user_id uuid,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_actor uuid := p_actor_user_id;
  v_code text := public._normalize_star_redeem_code(p_code);
  v_session public.star_redeem_sessions%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_now timestamptz := now();
  v_vouchers jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.is_superadmin(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.sweep_stale_star_redeem_sessions();

  IF v_code IS NULL OR length(v_code) = 0 THEN
    RAISE EXCEPTION 'Masukkan kode redeem user.';
  END IF;

  SELECT * INTO v_session
  FROM public.star_redeem_sessions
  WHERE code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode tidak ditemukan.';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Session redeem sudah tidak aktif.';
  END IF;

  IF v_session.last_seen_at < v_now - interval '30 seconds' THEN
    UPDATE public.star_redeem_sessions
    SET status = 'closed', closed_at = v_now
    WHERE id = v_session.id;
    RAISE EXCEPTION 'Session redeem sudah kedaluwarsa. Minta user buka ulang bagian Redeem.';
  END IF;

  UPDATE public.star_redeem_sessions
  SET validated_by = v_actor
  WHERE id = v_session.id;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = v_session.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil user tidak ditemukan.';
  END IF;

  SELECT coalesce(jsonb_agg(v ORDER BY (v->>'star_cost')::int ASC, v->>'name'), '[]'::jsonb)
  INTO v_vouchers
  FROM (
    SELECT jsonb_build_object(
      'id', vo.id,
      'name', vo.name,
      'description', vo.description,
      'how_to_get', vo.how_to_get,
      'how_to_use', vo.how_to_use,
      'terms_and_conditions', vo.terms_and_conditions,
      'star_cost', vo.star_cost,
      'image_url', vo.image_url,
      'bg_color', vo.bg_color,
      'stock_limit', vo.stock_limit,
      'redeemed_count', vo.redeemed_count,
      'valid_from', vo.valid_from,
      'valid_until', vo.valid_until
    ) AS v
    FROM public.vouchers vo
    WHERE vo.is_purchasable = true
      AND vo.star_cost IS NOT NULL
      AND vo.star_cost > 0
      AND vo.star_cost <= v_profile.coins
      AND v_now >= vo.valid_from
      AND v_now <= vo.valid_until
      AND (vo.stock_limit IS NULL OR vo.redeemed_count < vo.stock_limit)
  ) q;

  RETURN jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', v_session.id,
      'user_id', v_session.user_id,
      'code', v_session.code,
      'status', 'open',
      'created_at', v_session.created_at,
      'last_seen_at', v_session.last_seen_at
    ),
    'user', jsonb_build_object(
      'user_id', v_profile.user_id,
      'display_name', v_profile.display_name,
      'username', v_profile.username,
      'avatar_url', v_profile.avatar_url,
      'coins', v_profile.coins
    ),
    'vouchers', v_vouchers
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_star_redeem_code(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_star_redeem(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_voucher_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_actor uuid := p_actor_user_id;
  v_session public.star_redeem_sessions%ROWTYPE;
  v_voucher public.vouchers%ROWTYPE;
  v_coins integer;
  v_now timestamptz := now();
  v_redemption public.star_voucher_redemptions%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_superadmin(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.sweep_stale_star_redeem_sessions();

  SELECT * INTO v_session
  FROM public.star_redeem_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session tidak ditemukan';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Session redeem sudah tidak aktif.';
  END IF;

  IF v_session.last_seen_at < v_now - interval '30 seconds' THEN
    UPDATE public.star_redeem_sessions
    SET status = 'closed', closed_at = v_now
    WHERE id = v_session.id;
    RAISE EXCEPTION 'Session redeem sudah kedaluwarsa. Minta user buka ulang bagian Redeem.';
  END IF;

  SELECT * INTO v_voucher
  FROM public.vouchers
  WHERE id = p_voucher_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher tidak ditemukan';
  END IF;

  IF NOT v_voucher.is_purchasable THEN
    RAISE EXCEPTION 'Voucher ini tidak tersedia untuk ditukar Star.';
  END IF;

  IF v_now < v_voucher.valid_from THEN
    RAISE EXCEPTION 'Voucher belum berlaku.';
  END IF;

  IF v_now > v_voucher.valid_until THEN
    RAISE EXCEPTION 'Voucher sudah kadaluarsa.';
  END IF;

  IF v_voucher.stock_limit IS NOT NULL AND v_voucher.redeemed_count >= v_voucher.stock_limit THEN
    RAISE EXCEPTION 'Stok voucher habis.';
  END IF;

  IF v_voucher.star_cost IS NULL OR v_voucher.star_cost <= 0 THEN
    RAISE EXCEPTION 'Harga Star voucher tidak valid.';
  END IF;

  SELECT coins INTO v_coins
  FROM public.profiles
  WHERE user_id = v_session.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil tidak ditemukan';
  END IF;

  IF v_coins < v_voucher.star_cost THEN
    RAISE EXCEPTION 'Star tidak cukup.';
  END IF;

  -- Potong wallet saja; lifetime_coins / tier tidak berubah.
  UPDATE public.profiles
  SET coins = coins - v_voucher.star_cost
  WHERE user_id = v_session.user_id;

  UPDATE public.vouchers
  SET redeemed_count = redeemed_count + 1
  WHERE id = p_voucher_id;

  INSERT INTO public.star_voucher_redemptions (
    user_id,
    voucher_id,
    session_id,
    name,
    description,
    how_to_get,
    how_to_use,
    terms_and_conditions,
    star_cost,
    image_url,
    bg_color,
    status,
    redeemed_at,
    redeemed_by
  )
  VALUES (
    v_session.user_id,
    v_voucher.id,
    v_session.id,
    v_voucher.name,
    NULLIF(v_voucher.description, ''),
    NULLIF(v_voucher.how_to_get, ''),
    NULLIF(v_voucher.how_to_use, ''),
    NULLIF(v_voucher.terms_and_conditions, ''),
    v_voucher.star_cost,
    v_voucher.image_url,
    v_voucher.bg_color,
    'used',
    v_now,
    v_actor
  )
  RETURNING * INTO v_redemption;

  UPDATE public.star_redeem_sessions
  SET
    status = 'completed',
    completed_at = v_now,
    validated_by = coalesce(validated_by, v_actor)
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption.id,
    'session_id', v_session.id,
    'user_id', v_session.user_id,
    'voucher_id', v_voucher.id,
    'voucher_name', v_voucher.name,
    'star_cost', v_voucher.star_cost,
    'coins_remaining', v_coins - v_voucher.star_cost,
    'status', 'used'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_star_redeem(uuid, uuid, uuid)
  TO authenticated, service_role;
