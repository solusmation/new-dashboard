-- Redeem must target a specific recipient row (voucher + user), not a global code lookup.

DROP FUNCTION IF EXISTS public.admin_redeem_voucher_code(uuid, text);

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
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode tidak valid. Periksa kembali dan coba lagi.';
  END IF;

  IF v_row.code IS DISTINCT FROM v_code THEN
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

GRANT EXECUTE ON FUNCTION public.admin_redeem_voucher_code(uuid, text, uuid, uuid) TO authenticated, service_role;
