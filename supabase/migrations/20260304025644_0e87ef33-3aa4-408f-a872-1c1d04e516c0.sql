
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS base_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cgst_percent numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cgst_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sgst_percent numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sgst_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS igst_percent numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS igst_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_tax_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS po_contact_person text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'purchase_order' AND enumtypid = 'order_source'::regtype) THEN
    ALTER TYPE public.order_source ADD VALUE 'purchase_order';
  END IF;
END $$;
