-- Transaksi FnB hanya dicatat setelah pembayaran lunas.

ALTER TABLE public.transaksi_fnb
  ALTER COLUMN status SET DEFAULT 'paid';

UPDATE public.transaksi_fnb
SET status = 'paid'
WHERE status IS DISTINCT FROM 'paid';

COMMENT ON COLUMN public.transaksi_fnb.status IS 'Selalu paid — pesanan hanya diproses setelah pembayaran lunas.';
