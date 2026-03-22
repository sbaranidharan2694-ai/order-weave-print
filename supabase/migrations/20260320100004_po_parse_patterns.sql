CREATE TABLE IF NOT EXISTS public.po_parse_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT,
  document_signature TEXT NOT NULL,
  field_label TEXT NOT NULL,
  mapped_field TEXT NOT NULL,
  confidence_score NUMERIC(4,2) NOT NULL DEFAULT 0.5,
  times_used INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_patterns_sig ON public.po_parse_patterns(document_signature);
ALTER TABLE public.po_parse_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_patterns_auth" ON public.po_parse_patterns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
