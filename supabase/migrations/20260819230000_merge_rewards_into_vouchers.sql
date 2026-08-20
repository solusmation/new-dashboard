-- Merge reward concept into vouchers and remove rewards table.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'regular';

ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_category_check;
ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_category_check CHECK (category IN ('regular', 'reward'));

UPDATE public.vouchers
SET category = CASE WHEN is_purchasable THEN 'reward' ELSE 'regular' END;

-- Keep category aligned with purchasable state.
CREATE OR REPLACE FUNCTION public.sync_voucher_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.category := CASE WHEN NEW.is_purchasable THEN 'reward' ELSE 'regular' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vouchers_sync_category ON public.vouchers;
CREATE TRIGGER vouchers_sync_category
  BEFORE INSERT OR UPDATE OF is_purchasable ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_voucher_category();

DROP FUNCTION IF EXISTS public.redeem_reward_with_stars(uuid, uuid);

CREATE OR REPLACE FUNCTION public.redeem_voucher_with_stars(
  p_user_id uuid,
  p_voucher_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_voucher public.vouchers%ROWTYPE;
  v_coins integer;
  v_now timestamptz := now();
  v_code text;
BEGIN
  IF v_actor IS NOT NULL
     AND v_actor IS DISTINCT FROM p_user_id
     AND NOT public.is_superadmin(v_actor)
  THEN
    RAISE EXCEPTION 'Forbidden';
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

  SELECT coins INTO v_coins
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil tidak ditemukan';
  END IF;

  IF v_voucher.star_cost IS NULL OR v_coins < v_voucher.star_cost THEN
    RAISE EXCEPTION 'Star tidak cukup.';
  END IF;

  UPDATE public.profiles
  SET coins = coins - v_voucher.star_cost
  WHERE user_id = p_user_id;

  UPDATE public.vouchers
  SET redeemed_count = redeemed_count + 1
  WHERE id = p_voucher_id;

  v_code := public._issue_voucher_code(p_voucher_id, p_user_id, 'star_reward');

  RETURN jsonb_build_object(
    'ok', true,
    'voucher_id', v_voucher.id,
    'voucher_name', v_voucher.name,
    'star_cost', v_voucher.star_cost,
    'code', v_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_voucher_with_stars(uuid, uuid)
  TO authenticated, service_role;

DROP TABLE IF EXISTS public.rewards;
