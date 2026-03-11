-- Backfill production_jobs for all existing orders that don't have a job yet.
-- Run after 20260315100000_production_jobs.sql so current data is validated.

DO $$
DECLARE
  r RECORD;
  jno TEXT;
  desc_text TEXT;
BEGIN
  FOR r IN
    SELECT o.id, o.order_no, o.product_type, o.quantity, o.delivery_date, o.assigned_to, o.size, o.paper_type
    FROM public.orders o
    WHERE NOT EXISTS (SELECT 1 FROM public.production_jobs pj WHERE pj.order_id = o.id)
    ORDER BY o.created_at ASC
  LOOP
    jno := public.generate_job_number();
    desc_text := TRIM(CONCAT_WS(' · ', r.product_type, NULLIF(TRIM(COALESCE(r.size, '')), ''), NULLIF(TRIM(COALESCE(r.paper_type, '')), '')));
    IF desc_text = '' OR desc_text IS NULL THEN
      desc_text := COALESCE(r.product_type, 'Order');
    END IF;
    INSERT INTO public.production_jobs (order_id, job_number, description, quantity, status, assigned_to, priority, due_date)
    VALUES (
      r.id,
      jno,
      desc_text,
      COALESCE(r.quantity, 1),
      'design_review',
      r.assigned_to,
      'normal',
      r.delivery_date
    );
  END LOOP;
END $$;
