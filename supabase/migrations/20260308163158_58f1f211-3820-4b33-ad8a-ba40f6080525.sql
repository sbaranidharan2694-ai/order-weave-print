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

-- Ensure order-files storage bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-files', 'order-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for order-files (idempotent)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%order-files%' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Public order-files upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'order-files');
CREATE POLICY "Public order-files read" ON storage.objects FOR SELECT USING (bucket_id = 'order-files');
CREATE POLICY "Public order-files delete" ON storage.objects FOR DELETE USING (bucket_id = 'order-files');