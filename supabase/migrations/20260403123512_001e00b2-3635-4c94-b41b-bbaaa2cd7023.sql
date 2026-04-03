CREATE TABLE public.employee_advances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  granted_on date NOT NULL DEFAULT CURRENT_DATE,
  amount_paid numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON public.employee_advances FOR ALL TO public USING (true) WITH CHECK (true);