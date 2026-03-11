-- Add created_by to core tables and enforce RLS (single user: created_by = auth.uid() or legacy NULL).

-- Add created_by column (nullable for existing rows)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.bank_statements
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Ensure RLS is enabled
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow all access" ON public.orders;
DROP POLICY IF EXISTS "Allow all access" ON public.purchase_orders;
DROP POLICY IF EXISTS "Allow all access" ON public.bank_statements;
DROP POLICY IF EXISTS "Allow all access" ON public.bank_transactions;
DROP POLICY IF EXISTS "Allow all for bank_statements" ON public.bank_statements;
DROP POLICY IF EXISTS "Allow all for bank_transactions" ON public.bank_transactions;

-- orders: authenticated sees own rows or legacy (created_by IS NULL)
CREATE POLICY "orders_select"
  ON public.orders FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "orders_insert"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "orders_update"
  ON public.orders FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL)
  WITH CHECK (true);
CREATE POLICY "orders_delete"
  ON public.orders FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);

-- purchase_orders: same pattern
CREATE POLICY "purchase_orders_select"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "purchase_orders_insert"
  ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "purchase_orders_update"
  ON public.purchase_orders FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL)
  WITH CHECK (true);
CREATE POLICY "purchase_orders_delete"
  ON public.purchase_orders FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);

-- bank_statements: same pattern
CREATE POLICY "bank_statements_select"
  ON public.bank_statements FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "bank_statements_insert"
  ON public.bank_statements FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "bank_statements_update"
  ON public.bank_statements FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL)
  WITH CHECK (true);
CREATE POLICY "bank_statements_delete"
  ON public.bank_statements FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);

-- bank_transactions: access if parent bank_statement is visible
CREATE POLICY "bank_transactions_select"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_statements bs
      WHERE bs.id = bank_transactions.statement_id
      AND (bs.created_by = auth.uid() OR bs.created_by IS NULL)
    )
  );
CREATE POLICY "bank_transactions_insert"
  ON public.bank_transactions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bank_statements bs
      WHERE bs.id = bank_transactions.statement_id
      AND bs.created_by = auth.uid()
    )
  );
CREATE POLICY "bank_transactions_update"
  ON public.bank_transactions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_statements bs
      WHERE bs.id = bank_transactions.statement_id
      AND (bs.created_by = auth.uid() OR bs.created_by IS NULL)
    )
  )
  WITH CHECK (true);
CREATE POLICY "bank_transactions_delete"
  ON public.bank_transactions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_statements bs
      WHERE bs.id = bank_transactions.statement_id
      AND (bs.created_by = auth.uid() OR bs.created_by IS NULL)
    )
  );
