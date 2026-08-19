-- Storage bucket for reward catalog images.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reward-assets',
  'reward-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Reward assets public read" ON storage.objects;
CREATE POLICY "Reward assets public read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'reward-assets');

DROP POLICY IF EXISTS "Reward assets superadmin upload" ON storage.objects;
CREATE POLICY "Reward assets superadmin upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reward-assets'
    AND public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Reward assets superadmin update" ON storage.objects;
CREATE POLICY "Reward assets superadmin update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'reward-assets' AND public.is_superadmin(auth.uid()))
  WITH CHECK (bucket_id = 'reward-assets' AND public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Reward assets superadmin delete" ON storage.objects;
CREATE POLICY "Reward assets superadmin delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'reward-assets' AND public.is_superadmin(auth.uid()));
