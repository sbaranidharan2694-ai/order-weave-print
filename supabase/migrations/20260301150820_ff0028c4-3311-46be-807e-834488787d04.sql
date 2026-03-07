
-- Create custom types
CREATE TYPE order_source AS ENUM ('whatsapp', 'email', 'manual');
CREATE TYPE color_mode AS ENUM ('full_color', 'black_white', 'spot_color');
CREATE TYPE order_status AS ENUM (
  'Order Received', 'Design Review', 'Plate Making', 'Printing',
  'Cutting / Binding', 'Quality Check', 'Ready to Dispatch',
  'Delivered', 'Payment Pending', 'Cancelled'
);

-- Create orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  contact_no TEXT NOT NULL,
  email TEXT,
  source order_source NOT NULL DEFAULT 'manual',
  product_type TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  size TEXT,
  color_mode color_mode NOT NULL DEFAULT 'full_color',
  paper_type TEXT,
  special_instructions TEXT,
  file_url TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  advance_paid NUMERIC NOT NULL DEFAULT 0,
  balance_due NUMERIC GENERATED ALWAYS AS (amount - advance_paid) STORED,
  status order_status NOT NULL DEFAULT 'Order Received',
  assigned_to TEXT,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create status_logs table
CREATE TABLE public.status_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT DEFAULT 'System',
  notes TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_no TEXT NOT NULL UNIQUE,
  email TEXT,
  total_orders INT NOT NULL DEFAULT 0,
  total_spend NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create settings table
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT NOT NULL DEFAULT 'Super Printers',
  business_address TEXT,
  contact_number TEXT,
  whatsapp_number TEXT,
  gstin TEXT,
  order_prefix TEXT NOT NULL DEFAULT 'SP',
  operator_names TEXT[] DEFAULT '{}',
  paper_types TEXT[] DEFAULT ARRAY['130gsm Art Paper', '170gsm Art Paper', '300gsm Art Card', '80gsm Maplitho', '100gsm Maplitho'],
  product_types TEXT[] DEFAULT ARRAY['Visiting Cards', 'Flex Banner', 'Brochure', 'Pamphlet', 'Sticker', 'Letterhead', 'Bill Book', 'Carry Bag'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth for this OMS)
CREATE POLICY "Allow all access to orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to status_logs" ON public.status_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Order number sequence function
CREATE OR REPLACE FUNCTION public.generate_order_no()
RETURNS TEXT AS $$
DECLARE
  current_year TEXT;
  next_seq INT;
  prefix TEXT;
BEGIN
  SELECT order_prefix INTO prefix FROM public.settings LIMIT 1;
  IF prefix IS NULL THEN prefix := 'SP'; END IF;
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(order_no, '-', 3) AS INT)), 0) + 1
  INTO next_seq
  FROM public.orders
  WHERE order_no LIKE prefix || '-' || current_year || '-%';
  RETURN prefix || '-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Insert default settings
INSERT INTO public.settings (business_name) VALUES ('Super Printers');
