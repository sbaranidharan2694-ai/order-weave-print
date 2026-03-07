
-- Product Types table
CREATE TABLE public.product_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  default_size text,
  default_color_mode text DEFAULT 'full_color',
  default_paper_type text,
  whatsapp_template_body text,
  hsn_code text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read product_types" ON public.product_types FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public write product_types" ON public.product_types FOR ALL USING (true) WITH CHECK (true);

-- Seed product types
INSERT INTO public.product_types (name, default_size, default_color_mode, default_paper_type, hsn_code) VALUES
  ('Visiting Cards', '3.5 x 2 inches', 'full_color', '300gsm Art Card', '4911'),
  ('Flex Banner', '6 x 3 feet', 'full_color', 'Flex 280gsm', '3926'),
  ('Brochure', 'A4', 'full_color', '130gsm Art Paper', '4911'),
  ('Pamphlet', 'A5', 'full_color', '100gsm Art Paper', '4911'),
  ('Sticker', '3 x 2 inches', 'full_color', 'Vinyl', '3919'),
  ('Letterhead', 'A4', 'full_color', '100gsm Bond Paper', '4817'),
  ('Bill Book', 'A5', 'black_white', '60gsm Maplitho', '4820'),
  ('Carry Bag', '12 x 16 inches', 'full_color', '150gsm Art Paper', '4819'),
  ('Other', NULL, 'full_color', NULL, NULL);

-- Purchase Orders table
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL,
  po_date date,
  vendor_name text,
  contact_no text,
  contact_person text,
  gstin text,
  delivery_address text,
  delivery_date date,
  payment_terms text,
  currency text DEFAULT 'INR',
  total_amount numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  po_file_url text,
  parsed_data jsonb,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access purchase_orders" ON public.purchase_orders FOR ALL USING (true) WITH CHECK (true);

-- Purchase Order Line Items
CREATE TABLE public.purchase_order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
  line_item_no int,
  description text,
  hsn_code text,
  qty int DEFAULT 0,
  uom text DEFAULT 'NOS',
  unit_price numeric DEFAULT 0,
  amount numeric DEFAULT 0,
  mapped_product_type_id uuid REFERENCES public.product_types(id),
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.purchase_order_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access po_line_items" ON public.purchase_order_line_items FOR ALL USING (true) WITH CHECK (true);

-- Order Files table
CREATE TABLE public.order_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  filename text NOT NULL,
  mime_type text,
  file_size int,
  storage_url text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access order_files" ON public.order_files FOR ALL USING (true) WITH CHECK (true);

-- Order Tags table
CREATE TABLE public.order_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  tag_name text NOT NULL
);

ALTER TABLE public.order_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access order_tags" ON public.order_tags FOR ALL USING (true) WITH CHECK (true);

-- WhatsApp Templates
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access whatsapp_templates" ON public.whatsapp_templates FOR ALL USING (true) WITH CHECK (true);

-- Seed default template
INSERT INTO public.whatsapp_templates (name, body) VALUES
  ('Order Status Update', 'Hi {{customer_name}}, your order {{order_no}} for {{product_type}} (Qty: {{quantity}}) is now at stage: {{status}}. Delivery Date: {{delivery_date}}. Amount: ₹{{amount}}, Balance: ₹{{balance_due}}. For queries, contact Super Printers.');

-- Add new columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES public.purchase_orders(id),
  ADD COLUMN IF NOT EXISTS po_line_item_id uuid REFERENCES public.purchase_order_line_items(id),
  ADD COLUMN IF NOT EXISTS whatsapp_message_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_message_body text,
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS hsn_code text;

-- Add soft delete to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_tags;
