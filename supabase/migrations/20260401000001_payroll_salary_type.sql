-- Add salary_type column to payroll_employees
-- Values: 'monthly_8th' (paid on 8th, period 8th prev → 7th current)
--         'monthly_1st' (paid on 1st of next month)
--         'weekly'      (paid every Saturday)

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS salary_type TEXT NOT NULL DEFAULT 'monthly_8th'
    CHECK (salary_type IN ('monthly_8th', 'monthly_1st', 'weekly'));
