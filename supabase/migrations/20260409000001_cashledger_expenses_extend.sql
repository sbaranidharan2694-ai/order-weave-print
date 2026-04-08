-- Cash Ledger: Extend expenses table to support receipts, opening balances,
-- bank deposits, and adjustments alongside existing expense entries.
-- Safe, reversible, no data loss.

-- 1. Add new columns to expenses table
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'expense',
  ADD COLUMN IF NOT EXISTS affects_cash boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS counterparty text,
  ADD COLUMN IF NOT EXISTS order_ref text,
  ADD COLUMN IF NOT EXISTS actual_counted numeric(12,2),
  ADD COLUMN IF NOT EXISTS variance numeric(12,2);

-- 2. Add check constraint for valid entry types
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_entry_type_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_entry_type_check
  CHECK (entry_type IN ('expense', 'receipt', 'bank_deposit', 'opening_balance', 'adjustment'));

-- 3. Backfill: all existing rows are expenses
UPDATE public.expenses
  SET entry_type = 'expense',
      affects_cash = (payment_method = 'Cash')
  WHERE entry_type = 'expense';

-- 4. Normalize category labels: "Printing Materials" → "Ink / Toner"
UPDATE public.expenses
  SET category = 'Ink / Toner'
  WHERE category = 'Printing Materials';

-- 5. Index for faster KPI queries by entry_type and date
CREATE INDEX IF NOT EXISTS expenses_entry_type_date_idx
  ON public.expenses (entry_type, expense_date DESC);

-- To reverse this migration:
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS entry_type;
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS affects_cash;
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS counterparty;
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS order_ref;
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS actual_counted;
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS variance;
-- DROP INDEX IF EXISTS expenses_entry_type_date_idx;
