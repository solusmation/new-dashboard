-- Storage foto profil coach + path file di tabel coaches.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coach-assets',
  'coach-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Coach assets public read" ON storage.objects;
CREATE POLICY "Coach assets public read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'coach-assets');

DROP POLICY IF EXISTS "Coach assets superadmin upload" ON storage.objects;
CREATE POLICY "Coach assets superadmin upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'coach-assets'
    AND public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Coach assets superadmin update" ON storage.objects;
CREATE POLICY "Coach assets superadmin update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'coach-assets' AND public.is_superadmin(auth.uid()))
  WITH CHECK (bucket_id = 'coach-assets' AND public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Coach assets superadmin delete" ON storage.objects;
CREATE POLICY "Coach assets superadmin delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'coach-assets' AND public.is_superadmin(auth.uid()));

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS avatar_storage_path text NULL;

COMMENT ON COLUMN public.coaches.avatar_storage_path IS 'Path file foto di bucket coach-assets.';
