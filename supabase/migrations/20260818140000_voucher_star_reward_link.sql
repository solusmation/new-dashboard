-- Link rewards to vouchers, allow multiple unique codes per user,
-- and redeem catalog items with Star (profiles.coins).

-- ---------------------------------------------------------------------------
-- Vouchers: How to get (display copy)
-- ---------------------------------------------------------------------------

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS how_to_get text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.vouchers.how_to_get IS
  'Teks opsional cara mendapatkan voucher (tampilan app). Bukan saklar katalog Star.';

-- ---------------------------------------------------------------------------
-- Rewards: optional 1:1 link to a voucher campaign
-- ---------------------------------------------------------------------------

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS voucher_id uuid NULL REFERENCES public.vouchers (id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS rewards_voucher_id_uidx
  ON public.rewards (voucher_id)
  WHERE voucher_id IS NOT NULL;

ALTER TABLE public.rewards
  DROP CONSTRAINT IF EXISTS rewards_voucher_link_check;

ALTER TABLE public.rewards
  ADD CONSTRAINT rewards_voucher_link_check CHECK (
    voucher_id IS NULL OR reward_type = 'voucher_discount'
  );

CREATE INDEX IF NOT EXISTS rewards_voucher_id_idx
  ON public.rewards (voucher_id)
  WHERE voucher_id IS NOT NULL;

COMMENT ON COLUMN public.rewards.voucher_id IS
  'Jika diisi, penukaran Star menerbitkan voucher_codes baru untuk voucher ini.';

-- ---------------------------------------------------------------------------
-- Voucher codes: source + drop one-code-per-user
-- ---------------------------------------------------------------------------

ALTER TABLE public.voucher_codes
  ADD COLUMN IF NOT EXISTS issued_via text NOT NULL DEFAULT 'admin';

ALTER TABLE public.voucher_codes
  DROP CONSTRAINT IF EXISTS voucher_codes_issued_via_check;

ALTER TABLE public.voucher_codes
  ADD CONSTRAINT voucher_codes_issued_via_check CHECK (
    issued_via IN ('admin', 'star_reward')
  );

ALTER TABLE public.voucher_codes
  DROP CONSTRAINT IF EXISTS voucher_codes_voucher_user_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS voucher_codes_admin_voucher_user_uidx
  ON public.voucher_codes (voucher_id, user_id)
  WHERE issued_via = 'admin';

COMMENT ON COLUMN public.voucher_codes.issued_via IS
  'admin = diberikan admin; star_reward = ditukar Star. Unique code tetap global.';

-- ---------------------------------------------------------------------------
-- Issue helpers (admin skip duplicate; star always new unique code)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public._insert_voucher_code_for_user(uuid, uuid);

CREATE OR REPLACE FUNCTION public._insert_voucher_code_for_user(
  p_voucher_id uuid,
  p_user_id uuid,
  p_issued_via text DEFAULT 'admin'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_attempts int := 0;
  v_via text := coalesce(nullif(trim(p_issued_via), ''), 'admin');
BEGIN
  IF v_via NOT IN ('admin', 'star_reward') THEN
    RAISE EXCEPTION 'issued_via tidak valid';
  END IF;

  IF v_via = 'admin' AND EXISTS (
    SELECT 1
    FROM public.voucher_codes
    WHERE voucher_id = p_voucher_id
      AND user_id = p_user_id
      AND issued_via = 'admin'
  ) THEN
    RETURN false;
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    BEGIN
      INSERT INTO public.voucher_codes (voucher_id, user_id, code, issued_via)
      VALUES (p_voucher_id, p_user_id, public.generate_voucher_code(), v_via);
      RETURN true;
    EXCEPTION WHEN unique_violation THEN
      IF v_via = 'admin' AND EXISTS (
        SELECT 1
        FROM public.voucher_codes
        WHERE voucher_id = p_voucher_id
          AND user_id = p_user_id
          AND issued_via = 'admin'
      ) THEN
        RETURN false;
      END IF;
      IF v_attempts >= 16 THEN
        RAISE EXCEPTION 'Gagal menghasilkan kode voucher unik';
      END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._issue_voucher_code(
  p_voucher_id uuid,
  p_user_id uuid,
  p_issued_via text DEFAULT 'star_reward'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_attempts int := 0;
  v_via text := coalesce(nullif(trim(p_issued_via), ''), 'star_reward');
  v_code text;
BEGIN
  IF v_via NOT IN ('admin', 'star_reward') THEN
    RAISE EXCEPTION 'issued_via tidak valid';
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    BEGIN
      v_code := public.generate_voucher_code();
      INSERT INTO public.voucher_codes (voucher_id, user_id, code, issued_via)
      VALUES (p_voucher_id, p_user_id, v_code, v_via);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 16 THEN
        RAISE EXCEPTION 'Gagal menghasilkan kode voucher unik';
      END IF;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Desk redeem: match the specific code (user may hold many codes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_redeem_voucher_code(
  p_actor_user_id uuid,
  p_code text,
  p_voucher_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_code text;
  v_row public.voucher_codes%ROWTYPE;
  v_voucher public.vouchers%ROWTYPE;
  v_now timestamptz := now();
  v_display text;
  v_username text;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  v_code := public._normalize_voucher_code(p_code);
  IF v_code = '' OR length(v_code) <> 12 THEN
    RAISE EXCEPTION 'Kode tidak valid. Periksa kembali dan coba lagi.';
  END IF;

  SELECT * INTO v_row
  FROM public.voucher_codes
  WHERE voucher_id = p_voucher_id
    AND user_id = p_user_id
    AND code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode tidak valid. Periksa kembali dan coba lagi.';
  END IF;

  IF v_row.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Kode sudah digunakan dan tidak bisa ditukar lagi.';
  END IF;

  SELECT * INTO v_voucher FROM public.vouchers WHERE id = v_row.voucher_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher tidak ditemukan';
  END IF;

  IF v_now < v_voucher.valid_from THEN
    RAISE EXCEPTION 'Voucher belum berlaku.';
  END IF;

  IF v_now > v_voucher.valid_until THEN
    RAISE EXCEPTION 'Voucher sudah kadaluarsa dan tidak bisa ditukar.';
  END IF;

  UPDATE public.voucher_codes
  SET used_at = v_now, redeemed_by = p_actor_user_id
  WHERE id = v_row.id
    AND used_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode sudah digunakan dan tidak bisa ditukar lagi.';
  END IF;

  SELECT display_name, username
  INTO v_display, v_username
  FROM public.profiles
  WHERE user_id = v_row.user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'voucher_id', v_voucher.id,
    'voucher_name', v_voucher.name,
    'user_id', v_row.user_id,
    'display_name', coalesce(v_display, ''),
    'username', coalesce(v_username, ''),
    'code', v_row.code,
    'used_at', v_row.used_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_redeem_voucher_code(uuid, text, uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Star catalog redeem
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_reward_with_stars(
  p_user_id uuid,
  p_reward_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reward public.rewards%ROWTYPE;
  v_voucher public.vouchers%ROWTYPE;
  v_coins integer;
  v_now timestamptz := now();
  v_code text := NULL;
  v_new_count integer;
BEGIN
  IF v_actor IS NOT NULL
     AND v_actor IS DISTINCT FROM p_user_id
     AND NOT public.is_superadmin(v_actor)
  THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_reward
  FROM public.rewards
  WHERE id = p_reward_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reward tidak ditemukan';
  END IF;

  IF NOT v_reward.is_active THEN
    RAISE EXCEPTION 'Reward tidak aktif.';
  END IF;

  IF v_reward.stock_limit IS NOT NULL AND v_reward.redeemed_count >= v_reward.stock_limit THEN
    RAISE EXCEPTION 'Stok reward habis.';
  END IF;

  IF v_reward.voucher_id IS NOT NULL THEN
    SELECT * INTO v_voucher
    FROM public.vouchers
    WHERE id = v_reward.voucher_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Voucher tertaut tidak ditemukan';
    END IF;

    IF v_now < v_voucher.valid_from THEN
      RAISE EXCEPTION 'Voucher belum berlaku.';
    END IF;

    IF v_now > v_voucher.valid_until THEN
      RAISE EXCEPTION 'Voucher sudah kadaluarsa.';
    END IF;
  END IF;

  SELECT coins INTO v_coins
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil tidak ditemukan';
  END IF;

  IF v_coins < v_reward.star_cost THEN
    RAISE EXCEPTION 'Star tidak cukup.';
  END IF;

  UPDATE public.profiles
  SET coins = coins - v_reward.star_cost
  WHERE user_id = p_user_id;

  UPDATE public.rewards
  SET
    redeemed_count = redeemed_count + 1,
    is_active = CASE
      WHEN stock_limit IS NOT NULL AND redeemed_count + 1 >= stock_limit THEN false
      ELSE is_active
    END
  WHERE id = p_reward_id
  RETURNING redeemed_count INTO v_new_count;

  IF v_reward.voucher_id IS NOT NULL THEN
    v_code := public._issue_voucher_code(v_reward.voucher_id, p_user_id, 'star_reward');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reward_id', v_reward.id,
    'reward_name', v_reward.name,
    'star_cost', v_reward.star_cost,
    'redeemed_count', v_new_count,
    'voucher_id', v_reward.voucher_id,
    'code', v_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_reward_with_stars(uuid, uuid)
  TO authenticated, service_role;
