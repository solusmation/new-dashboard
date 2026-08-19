-- Storage bucket and image columns for voucher mockup images.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voucher-assets',
  'voucher-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Voucher assets public read" ON storage.objects;
CREATE POLICY "Voucher assets public read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'voucher-assets');

DROP POLICY IF EXISTS "Voucher assets superadmin upload" ON storage.objects;
CREATE POLICY "Voucher assets superadmin upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'voucher-assets'
    AND public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Voucher assets superadmin update" ON storage.objects;
CREATE POLICY "Voucher assets superadmin update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'voucher-assets' AND public.is_superadmin(auth.uid()))
  WITH CHECK (bucket_id = 'voucher-assets' AND public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Voucher assets superadmin delete" ON storage.objects;
CREATE POLICY "Voucher assets superadmin delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'voucher-assets' AND public.is_superadmin(auth.uid()));

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS image_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS image_url text NULL,
  ADD COLUMN IF NOT EXISTS bg_color text NOT NULL DEFAULT '#1a1a2e';

COMMENT ON COLUMN public.vouchers.image_storage_path IS 'Path file gambar di bucket voucher-assets.';
COMMENT ON COLUMN public.vouchers.image_url IS 'Public URL gambar voucher.';
COMMENT ON COLUMN public.vouchers.bg_color IS 'Warna background mockup voucher (hex).';
