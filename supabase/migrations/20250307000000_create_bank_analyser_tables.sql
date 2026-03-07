-- Bank Analyser: permanent storage for statements, transactions, and custom lookup
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor) or via Supabase CLI.

-- Statements metadata (one row per uploaded PDF)
CREATE TABLE IF NOT EXISTS public.bank_statements (
  id text PRIMARY KEY,
  account_key text NOT NULL,
  file_name text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  period text,
  period_start text,
  period_end text,
  account_number text,
  opening_balance numeric DEFAULT 0,
  closing_balance numeric DEFAULT 0,
  total_credits numeric DEFAULT 0,
  total_debits numeric DEFAULT 0,
  transaction_count integer DEFAULT 0,
  pdf_stored boolean DEFAULT false,
  pdf_file_size bigint DEFAULT 0,
  pdf_chunks integer DEFAULT 0,
  last_validated timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transactions (one row per parsed transaction)
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id text NOT NULL,
  statement_id text NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  date text NOT NULL,
  details text,
  ref_no text,
  debit numeric DEFAULT 0,
  credit numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  type text,
  counterparty text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, statement_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement_id ON public.bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account_key ON public.bank_statements(account_key);
CREATE INDEX IF NOT EXISTS idx_bank_statements_uploaded_at ON public.bank_statements(uploaded_at DESC);

-- Custom lookup: pattern -> display name (single row, key = 'default')
CREATE TABLE IF NOT EXISTS public.bank_custom_lookup (
  id text PRIMARY KEY DEFAULT 'default',
  lookup jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure default row exists
INSERT INTO public.bank_custom_lookup (id, lookup)
VALUES ('default', '{}')
ON CONFLICT (id) DO NOTHING;

-- RLS: allow all for now (app uses anon key; restrict in production if needed)
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_custom_lookup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for bank_statements" ON public.bank_statements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for bank_transactions" ON public.bank_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for bank_custom_lookup" ON public.bank_custom_lookup FOR ALL USING (true) WITH CHECK (true);
