-- Extend order_fulfillments for invoice and delivery challan tracking.
ALTER TABLE public.order_fulfillments
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS dc_number text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.order_fulfillments SET updated_at = created_at WHERE updated_at IS NULL;
