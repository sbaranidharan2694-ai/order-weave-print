
-- Add missing columns to purchase_orders
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS cgst numeric(12,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS sgst numeric(12,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS igst numeric(12,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS amount_in_words text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS shipping_address text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS linked_order_id uuid;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS parsed_raw jsonb;

-- Add missing columns to purchase_order_line_items
ALTER TABLE public.purchase_order_line_items ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) DEFAULT 18;
ALTER TABLE public.purchase_order_line_items ADD COLUMN IF NOT EXISTS gst_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.purchase_order_line_items ADD COLUMN IF NOT EXISTS line_total numeric(12,2) DEFAULT 0;
ALTER TABLE public.purchase_order_line_items ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Create po-documents storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('po-documents', 'po-documents', true) ON CONFLICT DO NOTHING;

-- Permissive storage policies for po-documents
CREATE POLICY "po_documents_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'po-documents');
CREATE POLICY "po_documents_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'po-documents');
CREATE POLICY "po_documents_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'po-documents');
CREATE POLICY "po_documents_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'po-documents');
