-- Resolve duplicate po_number: keep one row per po_number (latest id), remove others and their line items
DELETE FROM public.purchase_order_line_items
WHERE purchase_order_id IN (
  SELECT a.id FROM public.purchase_orders a
  JOIN public.purchase_orders b ON a.po_number = b.po_number AND a.id < b.id
);

DELETE FROM public.purchase_orders a
USING public.purchase_orders b
WHERE a.po_number = b.po_number AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_unique ON public.purchase_orders (po_number);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_unique ON public.purchase_orders (po_number);