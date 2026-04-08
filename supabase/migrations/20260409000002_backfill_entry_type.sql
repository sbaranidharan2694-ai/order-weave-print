-- Backfill existing expense rows that have NULL entry_type
-- (rows inserted before the cashledger migration ran)

UPDATE public.expenses
  SET entry_type = 'expense'
  WHERE entry_type IS NULL;

UPDATE public.expenses
  SET affects_cash = (payment_method = 'Cash')
  WHERE affects_cash IS NULL OR (entry_type = 'expense' AND affects_cash IS NOT NULL AND affects_cash = false AND payment_method = 'Cash');

-- Set column defaults so future rows never get NULL
ALTER TABLE public.expenses
  ALTER COLUMN entry_type SET DEFAULT 'expense',
  ALTER COLUMN affects_cash SET DEFAULT true;
