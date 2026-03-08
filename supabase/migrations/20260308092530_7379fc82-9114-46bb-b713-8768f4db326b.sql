-- Replace all overly permissive RLS policies with authenticated-only policies

-- attendance_uploads
DROP POLICY IF EXISTS "Allow all access to attendance_uploads" ON public.attendance_uploads;
CREATE POLICY "Authenticated access to attendance_uploads" ON public.attendance_uploads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bank_custom_lookup
DROP POLICY IF EXISTS "Allow all access to bank_custom_lookup" ON public.bank_custom_lookup;
CREATE POLICY "Authenticated access to bank_custom_lookup" ON public.bank_custom_lookup FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bank_statements
DROP POLICY IF EXISTS "Allow all access to bank_statements" ON public.bank_statements;
CREATE POLICY "Authenticated access to bank_statements" ON public.bank_statements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bank_transactions
DROP POLICY IF EXISTS "Allow all access to bank_transactions" ON public.bank_transactions;
CREATE POLICY "Authenticated access to bank_transactions" ON public.bank_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- customers
DROP POLICY IF EXISTS "Allow all access to customers" ON public.customers;
CREATE POLICY "Authenticated access to customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- notification_logs
DROP POLICY IF EXISTS "Public access notification_logs" ON public.notification_logs;
CREATE POLICY "Authenticated access to notification_logs" ON public.notification_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- order_files
DROP POLICY IF EXISTS "Public access order_files" ON public.order_files;
CREATE POLICY "Authenticated access to order_files" ON public.order_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- order_fulfillments
DROP POLICY IF EXISTS "Public access order_fulfillments" ON public.order_fulfillments;
CREATE POLICY "Authenticated access to order_fulfillments" ON public.order_fulfillments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- order_tags
DROP POLICY IF EXISTS "Public access order_tags" ON public.order_tags;
CREATE POLICY "Authenticated access to order_tags" ON public.order_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- orders
DROP POLICY IF EXISTS "Allow all access to orders" ON public.orders;
CREATE POLICY "Authenticated access to orders" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- payroll_employees
DROP POLICY IF EXISTS "Allow all access to payroll_employees" ON public.payroll_employees;
CREATE POLICY "Authenticated access to payroll_employees" ON public.payroll_employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- product_types
DROP POLICY IF EXISTS "Public read product_types" ON public.product_types;
DROP POLICY IF EXISTS "Public write product_types" ON public.product_types;
CREATE POLICY "Authenticated access to product_types" ON public.product_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- purchase_order_line_items
DROP POLICY IF EXISTS "Public access po_line_items" ON public.purchase_order_line_items;
CREATE POLICY "Authenticated access to po_line_items" ON public.purchase_order_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- purchase_orders
DROP POLICY IF EXISTS "Public access purchase_orders" ON public.purchase_orders;
CREATE POLICY "Authenticated access to purchase_orders" ON public.purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- settings
DROP POLICY IF EXISTS "Allow all access to settings" ON public.settings;
CREATE POLICY "Authenticated access to settings" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- status_logs
DROP POLICY IF EXISTS "Allow all access to status_logs" ON public.status_logs;
CREATE POLICY "Authenticated access to status_logs" ON public.status_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- whatsapp_templates
DROP POLICY IF EXISTS "Public access whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "Authenticated access to whatsapp_templates" ON public.whatsapp_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage: update bank-pdfs policies to authenticated only
DROP POLICY IF EXISTS "Allow public uploads to bank-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from bank-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to bank-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from bank-pdfs" ON storage.objects;

CREATE POLICY "Authenticated uploads to bank-pdfs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bank-pdfs');
CREATE POLICY "Authenticated reads from bank-pdfs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bank-pdfs');
CREATE POLICY "Authenticated updates to bank-pdfs" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'bank-pdfs');
CREATE POLICY "Authenticated deletes from bank-pdfs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'bank-pdfs');