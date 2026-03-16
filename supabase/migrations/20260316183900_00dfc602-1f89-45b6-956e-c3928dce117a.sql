
-- Re-declare generate_job_number to trigger types regeneration
CREATE OR REPLACE FUNCTION public.generate_job_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_seq INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(job_number FROM 'JOB-(\d+)$') AS INT)), 0) + 1
  INTO next_seq
  FROM public.production_jobs;
  RETURN 'JOB-' || LPAD(next_seq::TEXT, 5, '0');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.generate_job_number() TO anon;
GRANT EXECUTE ON FUNCTION public.generate_job_number() TO authenticated;

-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL,
  description text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON public.expenses FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
