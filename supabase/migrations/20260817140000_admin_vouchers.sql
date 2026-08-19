-- Admin-managed venue vouchers: unique per-user codes, redeem at the desk, auto-expire by period.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  how_to_use text NOT NULL DEFAULT '',
  terms_and_conditions text NOT NULL DEFAULT '',
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  assign_to_all boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.profiles (user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vouchers_period_check CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS vouchers_valid_until_idx
  ON public.vouchers (valid_until);

CREATE INDEX IF NOT EXISTS vouchers_assign_to_all_idx
  ON public.vouchers (assign_to_all)
  WHERE assign_to_all = true;

COMMENT ON TABLE public.vouchers IS
  'Kampanye voucher admin (nama, periode, teks opsional). Kode unik per user ada di voucher_codes.';

CREATE TABLE IF NOT EXISTS public.voucher_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  code text NOT NULL,
  used_at timestamptz NULL,
  redeemed_by uuid NULL REFERENCES public.profiles (user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voucher_codes_code_format CHECK (code ~ '^[A-HJ-NP-Z2-9]{12}$'),
  CONSTRAINT voucher_codes_voucher_user_uidx UNIQUE (voucher_id, user_id),
  CONSTRAINT voucher_codes_code_uidx UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS voucher_codes_voucher_idx
  ON public.voucher_codes (voucher_id);

CREATE INDEX IF NOT EXISTS voucher_codes_user_idx
  ON public.voucher_codes (user_id);

CREATE INDEX IF NOT EXISTS voucher_codes_used_at_idx
  ON public.voucher_codes (voucher_id, used_at)
  WHERE used_at IS NOT NULL;

COMMENT ON TABLE public.voucher_codes IS
  'Kode unik 12 karakter per user per voucher. Status kadaluarsa dihitung dari vouchers.valid_until.';

DROP TRIGGER IF EXISTS vouchers_set_updated_at ON public.vouchers;
CREATE TRIGGER vouchers_set_updated_at
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vouchers superadmin select" ON public.vouchers;
CREATE POLICY "Vouchers superadmin select"
  ON public.vouchers FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Vouchers superadmin insert" ON public.vouchers;
CREATE POLICY "Vouchers superadmin insert"
  ON public.vouchers FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Vouchers superadmin update" ON public.vouchers;
CREATE POLICY "Vouchers superadmin update"
  ON public.vouchers FOR UPDATE TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Vouchers superadmin delete" ON public.vouchers;
CREATE POLICY "Vouchers superadmin delete"
  ON public.vouchers FOR DELETE TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Voucher codes superadmin select" ON public.voucher_codes;
CREATE POLICY "Voucher codes superadmin select"
  ON public.voucher_codes FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Voucher codes superadmin insert" ON public.voucher_codes;
CREATE POLICY "Voucher codes superadmin insert"
  ON public.voucher_codes FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Voucher codes superadmin update" ON public.voucher_codes;
CREATE POLICY "Voucher codes superadmin update"
  ON public.voucher_codes FOR UPDATE TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Voucher codes superadmin delete" ON public.voucher_codes;
CREATE POLICY "Voucher codes superadmin delete"
  ON public.voucher_codes FOR DELETE TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Code generation + issuance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_voucher_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  result text;
  i int;
BEGIN
  bytes := extensions.gen_random_bytes(12);
  result := '';
  FOR i IN 0..11 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public._insert_voucher_code_for_user(
  p_voucher_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_attempts int := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.voucher_codes
    WHERE voucher_id = p_voucher_id AND user_id = p_user_id
  ) THEN
    RETURN false;
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    BEGIN
      INSERT INTO public.voucher_codes (voucher_id, user_id, code)
      VALUES (p_voucher_id, p_user_id, public.generate_voucher_code());
      RETURN true;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1 FROM public.voucher_codes
        WHERE voucher_id = p_voucher_id AND user_id = p_user_id
      ) THEN
        RETURN false;
      END IF;
      IF v_attempts >= 12 THEN
        RAISE EXCEPTION 'Gagal menghasilkan kode voucher unik';
      END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_voucher_codes(
  p_voucher_id uuid,
  p_user_ids uuid[] DEFAULT '{}'::uuid[],
  p_assign_to_all boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid;
  v_issued int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vouchers WHERE id = p_voucher_id) THEN
    RAISE EXCEPTION 'Voucher tidak ditemukan';
  END IF;

  IF p_assign_to_all THEN
    FOR v_uid IN SELECT user_id FROM public.profiles LOOP
      IF public._insert_voucher_code_for_user(p_voucher_id, v_uid) THEN
        v_issued := v_issued + 1;
      END IF;
    END LOOP;
  ELSE
    FOREACH v_uid IN ARRAY coalesce(p_user_ids, '{}'::uuid[]) LOOP
      IF public._insert_voucher_code_for_user(p_voucher_id, v_uid) THEN
        v_issued := v_issued + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_issued;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_all_vouchers_to_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT id
    FROM public.vouchers
    WHERE assign_to_all = true
      AND now() <= valid_until
  LOOP
    PERFORM public._insert_voucher_code_for_user(v.id, NEW.user_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_all_vouchers ON public.profiles;
CREATE TRIGGER profiles_assign_all_vouchers
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_all_vouchers_to_new_profile();

-- ---------------------------------------------------------------------------
-- Redeem
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._normalize_voucher_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(trim(both from coalesce(p_code, '')), '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.admin_redeem_voucher_code(
  p_actor_user_id uuid,
  p_code text
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
  WHERE code = v_code
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

GRANT EXECUTE ON FUNCTION public.issue_voucher_codes(uuid, uuid[], boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_redeem_voucher_code(uuid, text) TO authenticated, service_role;
