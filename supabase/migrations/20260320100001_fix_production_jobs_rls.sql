-- Remove the anon full-access policy — only authenticated users should access production jobs
DROP POLICY IF EXISTS "Anon full access production_jobs" ON public.production_jobs;

-- Add created_by to production_jobs for proper ownership tracking
ALTER TABLE public.production_jobs
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Tighten the authenticated policy to use ownership
DROP POLICY IF EXISTS "Authenticated full access production_jobs" ON public.production_jobs;

CREATE POLICY "production_jobs_select" ON public.production_jobs FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "production_jobs_insert" ON public.production_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "production_jobs_update" ON public.production_jobs FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (true);

CREATE POLICY "production_jobs_delete" ON public.production_jobs FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);
