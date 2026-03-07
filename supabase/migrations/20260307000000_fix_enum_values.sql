-- Fix order_status enum: add 'Partially Fulfilled' which was missing from DB
-- but present in app code (constants.ts and types.ts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Partially Fulfilled'
    AND enumtypid = 'public.order_status'::regtype
  ) THEN
    ALTER TYPE public.order_status ADD VALUE 'Partially Fulfilled';
  END IF;
END$$;

-- Fix order_source enum: add 'purchase_order' which was missing from DB
-- but present in app code (ImportPO feature uses this)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'purchase_order'
    AND enumtypid = 'public.order_source'::regtype
  ) THEN
    ALTER TYPE public.order_source ADD VALUE 'purchase_order';
  END IF;
END$$;
