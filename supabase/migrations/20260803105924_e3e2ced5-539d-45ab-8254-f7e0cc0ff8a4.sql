CREATE TABLE IF NOT EXISTS public.native_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'weights',
  size_bytes bigint NOT NULL DEFAULT 0,
  shard_size integer NOT NULL DEFAULT 262144,
  shard_count integer NOT NULL DEFAULT 0,
  merkle_root text,
  status text NOT NULL DEFAULT 'verifying',
  submitted_by text,
  notes text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.native_models TO service_role;
ALTER TABLE public.native_models ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.model_shards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.native_models(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  sha256 text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, idx)
);
GRANT ALL ON public.model_shards TO service_role;
ALTER TABLE public.model_shards ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shard_replicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shard_id uuid NOT NULL REFERENCES public.model_shards(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shard_id, node_key)
);
GRANT ALL ON public.shard_replicas TO service_role;
ALTER TABLE public.shard_replicas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS shard_replicas_node_idx ON public.shard_replicas(node_key);

ALTER TABLE public.peer_nodes ADD COLUMN IF NOT EXISTS score numeric NOT NULL DEFAULT 0;
ALTER TABLE public.peer_nodes ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'light';