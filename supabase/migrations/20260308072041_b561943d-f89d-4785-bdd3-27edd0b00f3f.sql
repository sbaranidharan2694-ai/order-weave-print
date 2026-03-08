
-- Bank Analyser tables
CREATE TABLE public.bank_statements (
  id TEXT PRIMARY KEY,
  account_key TEXT NOT NULL DEFAULT 'unknown',
  file_name TEXT NOT NULL DEFAULT 'statement.pdf',
  uploaded_at TEXT NOT NULL DEFAULT now()::text,
  period TEXT,
  period_start TEXT,
  period_end TEXT,
  account_number TEXT,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  closing_balance NUMERIC NOT NULL DEFAULT 0,
  total_credits NUMERIC NOT NULL DEFAULT 0,
  total_debits NUMERIC NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  pdf_stored BOOLEAN NOT NULL DEFAULT false,
  pdf_file_size INTEGER NOT NULL DEFAULT 0,
  pdf_chunks INTEGER NOT NULL DEFAULT 0,
  last_validated TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_statements_account_key ON public.bank_statements(account_key);
CREATE INDEX idx_bank_statements_account_number ON public.bank_statements(account_number);

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to bank_statements" ON public.bank_statements FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.bank_transactions (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT '',
  details TEXT,
  ref_no TEXT,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  balance NUMERIC NOT NULL DEFAULT 0,
  type TEXT,
  counterparty TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_transactions_statement_id ON public.bank_transactions(statement_id);
CREATE INDEX idx_bank_transactions_date ON public.bank_transactions(date);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to bank_transactions" ON public.bank_transactions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.bank_custom_lookup (
  id TEXT PRIMARY KEY DEFAULT 'default',
  lookup JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_custom_lookup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to bank_custom_lookup" ON public.bank_custom_lookup FOR ALL USING (true) WITH CHECK (true);

-- Also create attendance_uploads table if missing (fixes other build errors)
CREATE TABLE IF NOT EXISTS public.attendance_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  parsed_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to attendance_uploads" ON public.attendance_uploads FOR ALL USING (true) WITH CHECK (true);
