-- Replace auth.role()='authenticated' with auth.uid() IS NOT NULL to satisfy linter

DROP POLICY IF EXISTS "Authenticated access to attendance_uploads" ON public.attendance_uploads;
CREATE POLICY "Auth access attendance_uploads" ON public.attendance_uploads
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to bank_custom_lookup" ON public.bank_custom_lookup;
CREATE POLICY "Auth access bank_custom_lookup" ON public.bank_custom_lookup
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to bank_statements" ON public.bank_statements;
CREATE POLICY "Auth access bank_statements" ON public.bank_statements
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to bank_transactions" ON public.bank_transactions;
CREATE POLICY "Auth access bank_transactions" ON public.bank_transactions
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to customers" ON public.customers;
CREATE POLICY "Auth access customers" ON public.customers
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to notification_logs" ON public.notification_logs;
CREATE POLICY "Auth access notification_logs" ON public.notification_logs
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to order_files" ON public.order_files;
CREATE POLICY "Auth access order_files" ON public.order_files
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to order_fulfillments" ON public.order_fulfillments;
CREATE POLICY "Auth access order_fulfillments" ON public.order_fulfillments
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to order_tags" ON public.order_tags;
CREATE POLICY "Auth access order_tags" ON public.order_tags
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to orders" ON public.orders;
CREATE POLICY "Auth access orders" ON public.orders
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to payroll_employees" ON public.payroll_employees;
CREATE POLICY "Auth access payroll_employees" ON public.payroll_employees
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to product_types" ON public.product_types;
CREATE POLICY "Auth access product_types" ON public.product_types
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to po_line_items" ON public.purchase_order_line_items;
CREATE POLICY "Auth access po_line_items" ON public.purchase_order_line_items
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to purchase_orders" ON public.purchase_orders;
CREATE POLICY "Auth access purchase_orders" ON public.purchase_orders
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to settings" ON public.settings;
CREATE POLICY "Auth access settings" ON public.settings
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to status_logs" ON public.status_logs;
CREATE POLICY "Auth access status_logs" ON public.status_logs
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated access to whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "Auth access whatsapp_templates" ON public.whatsapp_templates
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Fix storage policies too
DROP POLICY IF EXISTS "Authenticated uploads to bank-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated reads from bank-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated updates to bank-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated deletes from bank-pdfs" ON storage.objects;

CREATE POLICY "Auth uploads bank-pdfs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bank-pdfs' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth reads bank-pdfs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'bank-pdfs' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth updates bank-pdfs" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'bank-pdfs' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth deletes bank-pdfs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'bank-pdfs' AND auth.uid() IS NOT NULL);