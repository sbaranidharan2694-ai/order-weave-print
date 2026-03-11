CREATE TABLE IF NOT EXISTS public.po_parse_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text,
  document_signature text NOT NULL,
  field_label text NOT NULL,
  mapped_field text NOT NULL,
  confidence_score numeric(3,2) NOT NULL DEFAULT 0.7,
  times_used integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_parse_patterns_signature ON public.po_parse_patterns(document_signature);
CREATE INDEX IF NOT EXISTS idx_po_parse_patterns_customer ON public.po_parse_patterns(customer_name);

ALTER TABLE public.po_parse_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON public.po_parse_patterns FOR ALL TO public USING (true) WITH CHECK (true);