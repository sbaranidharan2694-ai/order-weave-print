-- Attendance tracker: upload monthly attendance PDFs and track by employee
-- Run in Supabase SQL Editor if not using Supabase CLI.

CREATE TABLE IF NOT EXISTS public.attendance_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year text NOT NULL,
  file_name text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  parsed_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_uploads_month_year ON public.attendance_uploads(month_year);
CREATE INDEX IF NOT EXISTS idx_attendance_uploads_uploaded_at ON public.attendance_uploads(uploaded_at DESC);

ALTER TABLE public.attendance_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for attendance_uploads" ON public.attendance_uploads FOR ALL USING (true) WITH CHECK (true);
