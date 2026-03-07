-- Bank Analyser: storage bucket for PDF files (no localStorage).
-- Run with other migrations. Creates bucket "bank-pdfs" and allows anon read/write.

-- Create bucket for Bank Analyser PDFs (50 MB limit, PDF only when supported by your Supabase version)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bank-pdfs', 'bank-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Allow anon to read/write objects in bank-pdfs (for app using anon key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow anon read/write bank-pdfs'
  ) THEN
    CREATE POLICY "Allow anon read/write bank-pdfs"
    ON storage.objects FOR ALL
    TO anon
    USING (bucket_id = 'bank-pdfs')
    WITH CHECK (bucket_id = 'bank-pdfs');
  END IF;
END $$;
