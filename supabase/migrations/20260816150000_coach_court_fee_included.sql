-- Tarif coach: apakah sudah termasuk court fee.

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS court_fee_included boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coaches.court_fee_included IS
  'true = tarif sudah termasuk court (Court Fee Included); false = tarif coach saja (Court Fee Not Included).';
