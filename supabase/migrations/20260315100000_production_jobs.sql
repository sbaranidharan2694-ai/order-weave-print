-- Production jobs: one per order (order line item) for print workflow tracking
CREATE TABLE public.production_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID,
  job_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'design_review' CHECK (status IN (
    'design_review', 'plate_making', 'printing', 'cutting_binding',
    'quality_check', 'ready_dispatch', 'completed'
  )),
  assigned_to TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_production_jobs_order_id ON public.production_jobs(order_id);
CREATE INDEX idx_production_jobs_status ON public.production_jobs(status);
CREATE INDEX idx_production_jobs_due_date ON public.production_jobs(due_date);
CREATE INDEX idx_production_jobs_assigned_to ON public.production_jobs(assigned_to);

ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access production_jobs"
  ON public.production_jobs FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anon full access production_jobs"
  ON public.production_jobs FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_production_jobs_updated_at
  BEFORE UPDATE ON public.production_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Generate job number: JOB-YYYY-NNNN
CREATE OR REPLACE FUNCTION public.generate_job_number()
RETURNS TEXT AS $$
DECLARE
  current_year TEXT;
  next_seq INT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(job_number, '-', 3) AS INT)), 0) + 1
  INTO next_seq
  FROM public.production_jobs
  WHERE job_number LIKE 'JOB-' || current_year || '-%';
  RETURN 'JOB-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SET search_path = public;

GRANT EXECUTE ON FUNCTION public.generate_job_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_job_number() TO anon;

COMMENT ON TABLE public.production_jobs IS 'One job per order (line item) for print production tracking';
