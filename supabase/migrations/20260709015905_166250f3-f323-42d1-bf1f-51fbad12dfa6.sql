
CREATE TABLE public.model_verifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hf_model_id text NOT NULL,
  previous_sha text,
  current_sha text,
  drift boolean NOT NULL DEFAULT false,
  action text NOT NULL,
  notes text,
  checked_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX model_verifications_model_idx ON public.model_verifications (hf_model_id, checked_at DESC);

GRANT SELECT ON public.model_verifications TO anon, authenticated;
GRANT ALL ON public.model_verifications TO service_role;

ALTER TABLE public.model_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read verification history"
  ON public.model_verifications
  FOR SELECT
  USING (true);
