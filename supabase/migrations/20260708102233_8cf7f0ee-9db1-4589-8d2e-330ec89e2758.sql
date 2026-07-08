
CREATE TYPE public.model_lane AS ENUM ('fast','reasoning','code','creative');
CREATE TYPE public.model_status AS ENUM ('pending','approved','quarantined','rejected');

CREATE TABLE public.model_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hf_model_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  lane public.model_lane NOT NULL,
  status public.model_status NOT NULL DEFAULT 'pending',
  manifest_sha TEXT,
  submitted_by TEXT,
  notes TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.model_registry TO anon, authenticated;
GRANT ALL ON public.model_registry TO service_role;
ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read non-rejected models"
  ON public.model_registry FOR SELECT
  USING (status <> 'rejected');

CREATE POLICY "Anyone can submit models"
  ON public.model_registry FOR INSERT
  WITH CHECK (status = 'pending');

CREATE TABLE public.peer_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_key TEXT NOT NULL UNIQUE,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.peer_nodes TO anon, authenticated;
GRANT ALL ON public.peer_nodes TO service_role;
ALTER TABLE public.peer_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read peer nodes" ON public.peer_nodes FOR SELECT USING (true);
CREATE POLICY "Anyone can register a peer" ON public.peer_nodes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can heartbeat their peer" ON public.peer_nodes FOR UPDATE USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_model_registry_updated
  BEFORE UPDATE ON public.model_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
