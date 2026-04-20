ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS metadata JSONB;
COMMENT ON COLUMN public.orders.metadata IS 'Extensible JSON metadata: book_details, file_names, etc.';
