-- Manual occupancy overrides for finance okupansi grid (admin-only via service role / RLS).

CREATE TABLE IF NOT EXISTS public.court_occupancy_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_date date NOT NULL,
  hour smallint NOT NULL CHECK (hour >= 0 AND hour <= 23),
  manual_courts smallint NOT NULL DEFAULT 0 CHECK (manual_courts >= 0),
  category text NOT NULL CHECK (
    category IN (
      'ayo',
      'payment_link',
      'tunai',
      'unpaid',
      'event',
      'free'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.profiles (user_id) ON DELETE SET NULL,
  CONSTRAINT court_occupancy_manual_date_hour_uidx UNIQUE (booking_date, hour)
);

CREATE INDEX IF NOT EXISTS court_occupancy_manual_date_idx
  ON public.court_occupancy_manual (booking_date);

COMMENT ON TABLE public.court_occupancy_manual IS
  'Tambahan okupansi manual per slot jam (tidak mengurangi booking member dari court_bookings).';

DROP TRIGGER IF EXISTS court_occupancy_manual_set_updated_at ON public.court_occupancy_manual;
CREATE TRIGGER court_occupancy_manual_set_updated_at
  BEFORE UPDATE ON public.court_occupancy_manual
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.court_occupancy_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Court occupancy manual superadmin select" ON public.court_occupancy_manual;
CREATE POLICY "Court occupancy manual superadmin select"
  ON public.court_occupancy_manual
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Court occupancy manual superadmin insert" ON public.court_occupancy_manual;
CREATE POLICY "Court occupancy manual superadmin insert"
  ON public.court_occupancy_manual
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Court occupancy manual superadmin update" ON public.court_occupancy_manual;
CREATE POLICY "Court occupancy manual superadmin update"
  ON public.court_occupancy_manual
  FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Court occupancy manual superadmin delete" ON public.court_occupancy_manual;
CREATE POLICY "Court occupancy manual superadmin delete"
  ON public.court_occupancy_manual
  FOR DELETE
  TO authenticated
  USING (public.is_superadmin(auth.uid()));
