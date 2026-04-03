CREATE TABLE public.employee_advances (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code   text         NOT NULL,
  amount          numeric      NOT NULL CHECK (amount > 0),
  granted_on      date         NOT NULL DEFAULT CURRENT_DATE,
  amount_paid     numeric      NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_advances_employee_code ON public.employee_advances(employee_code);

ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for employee_advances" ON public.employee_advances FOR ALL USING (true) WITH CHECK (true);
