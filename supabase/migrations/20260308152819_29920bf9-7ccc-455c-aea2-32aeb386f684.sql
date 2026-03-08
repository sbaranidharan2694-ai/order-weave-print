-- Performance indexes that were skipped by the repair workaround
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON public.orders (order_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON public.orders (customer_name);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement_id ON public.bank_transactions (statement_id);
CREATE INDEX IF NOT EXISTS idx_order_tags_order_id ON public.order_tags (order_id);
CREATE INDEX IF NOT EXISTS idx_order_fulfillments_order_id ON public.order_fulfillments (order_id);
CREATE INDEX IF NOT EXISTS idx_status_logs_order_id ON public.status_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON public.notification_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON public.order_files (order_id);