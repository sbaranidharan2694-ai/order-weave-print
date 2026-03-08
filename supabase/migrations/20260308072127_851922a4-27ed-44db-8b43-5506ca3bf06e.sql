
CREATE TABLE IF NOT EXISTS public.payroll_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  monthly_salary NUMERIC NOT NULL DEFAULT 0,
  weekly_salary NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to payroll_employees" ON public.payroll_employees FOR ALL USING (true) WITH CHECK (true);
