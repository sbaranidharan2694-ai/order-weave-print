
-- Revert all RLS policies to public access (no authentication required)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'attendance_uploads', 'bank_custom_lookup', 'bank_statements', 'bank_transactions',
    'customers', 'notification_logs', 'order_files', 'order_fulfillments',
    'order_tags', 'orders', 'payroll_employees', 'product_types',
    'purchase_order_line_items', 'purchase_orders', 'settings', 'status_logs',
    'whatsapp_templates'
  ];
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY "Allow all access" ON public.%I FOR ALL USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- Storage policies: ensure public access for bank-pdfs and order-files
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (policyname LIKE '%bank-pdfs%' OR policyname LIKE '%order%file%' OR policyname LIKE '%order-file%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Public access bank-pdfs upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bank-pdfs');
CREATE POLICY "Public access bank-pdfs read" ON storage.objects FOR SELECT USING (bucket_id = 'bank-pdfs');
CREATE POLICY "Public access bank-pdfs update" ON storage.objects FOR UPDATE USING (bucket_id = 'bank-pdfs');
CREATE POLICY "Public access bank-pdfs delete" ON storage.objects FOR DELETE USING (bucket_id = 'bank-pdfs');

CREATE POLICY "Public access order-files upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'order-files');
CREATE POLICY "Public access order-files read" ON storage.objects FOR SELECT USING (bucket_id = 'order-files');
CREATE POLICY "Public access order-files delete" ON storage.objects FOR DELETE USING (bucket_id = 'order-files');

-- Ensure anon can call generate_order_no
GRANT EXECUTE ON FUNCTION public.generate_order_no() TO anon;
GRANT EXECUTE ON FUNCTION public.generate_order_no() TO authenticated;
