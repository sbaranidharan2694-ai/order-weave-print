-- Drop the public (unauthenticated) policy
DROP POLICY IF EXISTS "Allow all access" ON public.expenses;

-- Add created_by for ownership tracking
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Require authentication for all operations
CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "expenses_insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "expenses_update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL)
  WITH CHECK (true);

CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);
