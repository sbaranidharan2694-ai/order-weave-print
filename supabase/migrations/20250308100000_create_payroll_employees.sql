-- Payroll: employee master with monthly salary for loss-of-pay calculation
-- Run automatically via GitHub Actions or manually in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.payroll_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  monthly_salary numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_employee_code ON public.payroll_employees(employee_code);

ALTER TABLE public.payroll_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for payroll_employees" ON public.payroll_employees FOR ALL USING (true) WITH CHECK (true);
