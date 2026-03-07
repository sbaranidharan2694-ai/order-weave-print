
-- Add po_number text field to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS po_number TEXT;

-- Add invoice settings columns to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS invoice_footer TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS show_gst_breakdown BOOLEAN DEFAULT true;

-- Add address column to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS gstin TEXT;
