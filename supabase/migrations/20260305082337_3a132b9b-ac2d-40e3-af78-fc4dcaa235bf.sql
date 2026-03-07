
-- Add "Partially Fulfilled" to order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'Partially Fulfilled';

-- Add partial fulfillment columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qty_ordered integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qty_fulfilled integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qty_pending integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_partial_order boolean DEFAULT false;

-- Create order_fulfillments table
CREATE TABLE IF NOT EXISTS public.order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  fulfillment_date date NOT NULL DEFAULT CURRENT_DATE,
  qty_delivered integer NOT NULL CHECK (qty_delivered > 0),
  delivery_note text,
  delivered_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Public access order_fulfillments" ON public.order_fulfillments FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_fulfillments;

-- Backfill qty_ordered from quantity for existing orders
UPDATE public.orders SET qty_ordered = quantity WHERE qty_ordered = 0 OR qty_ordered IS NULL;
UPDATE public.orders SET qty_pending = quantity - qty_fulfilled WHERE qty_pending = 0 OR qty_pending IS NULL;
