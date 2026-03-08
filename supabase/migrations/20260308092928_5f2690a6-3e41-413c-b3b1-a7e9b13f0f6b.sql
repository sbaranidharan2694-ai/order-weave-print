-- Fix storage: drop existing policies first, then recreate
DROP POLICY IF EXISTS "Authenticated uploads to bank-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated reads from bank-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated updates to bank-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated deletes from bank-pdfs" ON storage.objects;

UPDATE storage.buckets SET public = false WHERE id = 'bank-pdfs';

CREATE POLICY "Authenticated uploads to bank-pdfs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bank-pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated reads from bank-pdfs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'bank-pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated updates to bank-pdfs" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'bank-pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated deletes from bank-pdfs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'bank-pdfs' AND auth.role() = 'authenticated');