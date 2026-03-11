-- Make po-documents bucket private and enforce user-scoped RLS (path: user_id/filename).
UPDATE storage.buckets SET public = false WHERE id = 'po-documents';

-- Drop existing permissive policies
DROP POLICY IF EXISTS "po_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "po_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "po_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "po_documents_delete" ON storage.objects;

-- SELECT: user can read own folder (path first segment = auth.uid())
CREATE POLICY "po_documents_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'po-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: user can only upload to their own folder
CREATE POLICY "po_documents_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'po-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE/DELETE: same as SELECT for own folder
CREATE POLICY "po_documents_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'po-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "po_documents_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'po-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
