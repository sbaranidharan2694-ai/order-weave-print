-- Create bank-pdfs storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('bank-pdfs', 'bank-pdfs', true);

-- Allow anyone to upload to bank-pdfs
CREATE POLICY "Allow public uploads to bank-pdfs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bank-pdfs');

-- Allow anyone to read from bank-pdfs
CREATE POLICY "Allow public reads from bank-pdfs"
ON storage.objects FOR SELECT
USING (bucket_id = 'bank-pdfs');

-- Allow anyone to update in bank-pdfs
CREATE POLICY "Allow public updates to bank-pdfs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'bank-pdfs');

-- Allow anyone to delete from bank-pdfs
CREATE POLICY "Allow public deletes from bank-pdfs"
ON storage.objects FOR DELETE
USING (bucket_id = 'bank-pdfs');