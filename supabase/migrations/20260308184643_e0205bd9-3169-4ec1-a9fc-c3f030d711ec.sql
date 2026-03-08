-- Create storage bucket for PO files
INSERT INTO storage.buckets (id, name, public)
VALUES ('po-files', 'po-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read/write on po-files bucket
CREATE POLICY "Allow public read po-files" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'po-files');

CREATE POLICY "Allow public insert po-files" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'po-files');

CREATE POLICY "Allow public update po-files" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'po-files');

CREATE POLICY "Allow public delete po-files" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'po-files');