-- Drop all RESTRICTIVE policies
DROP POLICY IF EXISTS "Auth access attendance_uploads" ON public.attendance_uploads;
DROP POLICY IF EXISTS "Auth access bank_custom_lookup" ON public.bank_custom_lookup;
DROP POLICY IF EXISTS "Auth access bank_statements" ON public.bank_statements;
DROP POLICY IF EXISTS "Auth access bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Auth access customers" ON public.customers;
DROP POLICY IF EXISTS "Auth access notification_logs" ON public.notification_logs;
DROP POLICY IF EXISTS "Auth access order_files" ON public.order_files;
DROP POLICY IF EXISTS "Auth access order_fulfillments" ON public.order_fulfillments;
DROP POLICY IF EXISTS "Auth access order_tags" ON public.order_tags;
DROP POLICY IF EXISTS "Auth access orders" ON public.orders;
DROP POLICY IF EXISTS "Auth access payroll_employees" ON public.payroll_employees;
DROP POLICY IF EXISTS "Auth access product_types" ON public.product_types;
DROP POLICY IF EXISTS "Auth access po_line_items" ON public.purchase_order_line_items;
DROP POLICY IF EXISTS "Auth access purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Auth access settings" ON public.settings;
DROP POLICY IF EXISTS "Auth access status_logs" ON public.status_logs;
DROP POLICY IF EXISTS "Auth access whatsapp_templates" ON public.whatsapp_templates;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Authenticated full access" ON public.attendance_uploads FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.bank_custom_lookup FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.bank_statements FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.bank_transactions FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.customers FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.notification_logs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.order_files FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.order_fulfillments FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.order_tags FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.orders FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.payroll_employees FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.product_types FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.purchase_order_line_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.purchase_orders FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.settings FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.status_logs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON public.whatsapp_templates FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON public.orders (order_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON public.orders (customer_name);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement_id ON public.bank_transactions (statement_id);
CREATE INDEX IF NOT EXISTS idx_order_tags_order_id ON public.order_tags (order_id);
CREATE INDEX IF NOT EXISTS idx_order_fulfillments_order_id ON public.order_fulfillments (order_id);
CREATE INDEX IF NOT EXISTS idx_status_logs_order_id ON public.status_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON public.notification_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON public.order_files (order_id);