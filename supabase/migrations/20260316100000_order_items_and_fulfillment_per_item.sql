-- order_items: one row per line item (PO line or single product)
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_no INT NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all order_items" ON public.order_items FOR ALL USING (true) WITH CHECK (true);

-- order_fulfillments: add order_item_id so delivery can be tracked per line item
ALTER TABLE public.order_fulfillments
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_order_fulfillments_order_item_id ON public.order_fulfillments(order_item_id);

-- Backfill: for existing orders without order_items, create one order_item from order
-- quantity must satisfy CHECK (quantity > 0), so use GREATEST(1, ...)
INSERT INTO public.order_items (order_id, item_no, description, quantity, unit_price, amount)
SELECT o.id, 1, COALESCE(o.product_type, 'Order'),
       GREATEST(1, COALESCE(o.quantity, 1)),
       CASE WHEN COALESCE(o.quantity, 1) > 0 THEN COALESCE(o.amount, 0) / GREATEST(1, o.quantity) ELSE 0 END,
       COALESCE(o.amount, 0)
FROM public.orders o
WHERE NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id);

COMMENT ON TABLE public.order_items IS 'Line items per order; PO import creates one per PO line';
