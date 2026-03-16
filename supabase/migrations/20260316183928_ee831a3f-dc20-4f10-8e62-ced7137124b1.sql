
-- Create order_items table
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_no integer NOT NULL DEFAULT 1,
  description text,
  quantity integer NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.order_items FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- Create production_jobs table
CREATE TABLE IF NOT EXISTS public.production_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  job_number text NOT NULL,
  description text,
  quantity integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'design_review',
  assigned_to text,
  priority text NOT NULL DEFAULT 'normal',
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.production_jobs FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_production_jobs_order_id ON public.production_jobs(order_id);

CREATE TRIGGER update_production_jobs_updated_at
  BEFORE UPDATE ON public.production_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
