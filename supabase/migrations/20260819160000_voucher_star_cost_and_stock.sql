-- Add star pricing and stock management directly to vouchers.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS is_purchasable boolean NOT NULL DEFAULT false;

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS star_cost integer NULL;

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS stock_limit integer NULL;

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS redeemed_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_star_cost_check;
ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_star_cost_check CHECK (
    (NOT is_purchasable) OR (star_cost IS NOT NULL AND star_cost > 0)
  );

ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_stock_limit_check;
ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_stock_limit_check CHECK (
    stock_limit IS NULL OR stock_limit > 0
  );

ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_redeemed_count_check;
ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_redeemed_count_check CHECK (redeemed_count >= 0);

ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_stock_redeemed_check;
ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_stock_redeemed_check CHECK (
    stock_limit IS NULL OR redeemed_count <= stock_limit
  );

COMMENT ON COLUMN public.vouchers.is_purchasable IS
  'Jika true, voucher bisa dibeli dengan Star di katalog.';
COMMENT ON COLUMN public.vouchers.star_cost IS
  'Harga Star untuk membeli voucher (wajib jika is_purchasable = true).';
COMMENT ON COLUMN public.vouchers.stock_limit IS
  'Batas stok pembelian Star; NULL = tanpa batas.';
COMMENT ON COLUMN public.vouchers.redeemed_count IS
  'Jumlah voucher yang sudah dibeli dengan Star.';
