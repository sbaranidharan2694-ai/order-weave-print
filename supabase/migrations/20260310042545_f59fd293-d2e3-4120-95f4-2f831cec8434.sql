-- Resolve duplicate po_number: keep one row per po_number (latest id), remove others.
-- First drop FK references from orders so we can delete line items and purchase_orders.

-- 1. Null out orders.po_line_item_id for line items that belong to duplicate POs
UPDATE public.orders
SET po_line_item_id = NULL
WHERE po_line_item_id IN (
  SELECT poli.id FROM public.purchase_order_line_items poli
  WHERE poli.purchase_order_id IN (
    SELECT a.id FROM public.purchase_orders a
    JOIN public.purchase_orders b ON a.po_number = b.po_number AND a.id < b.id
  )
);

-- 2. Null out orders.po_id for duplicate POs we are about to delete
UPDATE public.orders
SET po_id = NULL
WHERE po_id IN (
  SELECT a.id FROM public.purchase_orders a
  JOIN public.purchase_orders b ON a.po_number = b.po_number AND a.id < b.id
);

-- 3. Delete line items belonging to duplicate purchase_orders
DELETE FROM public.purchase_order_line_items
WHERE purchase_order_id IN (
  SELECT a.id FROM public.purchase_orders a
  JOIN public.purchase_orders b ON a.po_number = b.po_number AND a.id < b.id
);

-- 4. Delete duplicate purchase_orders (keep row with max id per po_number)
DELETE FROM public.purchase_orders a
USING public.purchase_orders b
WHERE a.po_number = b.po_number AND a.id < b.id;

-- 5. Add unique index on po_number
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_unique ON public.purchase_orders (po_number);
