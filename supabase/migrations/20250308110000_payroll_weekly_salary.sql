-- Add weekly salary for weekly payroll support
ALTER TABLE public.payroll_employees
  ADD COLUMN IF NOT EXISTS weekly_salary numeric NOT NULL DEFAULT 0;
