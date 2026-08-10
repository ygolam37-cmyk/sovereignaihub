DROP POLICY IF EXISTS "model_shards_deny_all_clients" ON storage.objects;

CREATE POLICY "model_shards_deny_all_clients"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'model-shards')
WITH CHECK (bucket_id <> 'model-shards');

REVOKE ALL ON public.model_shards FROM anon, authenticated;
REVOKE ALL ON public.shard_replicas FROM anon, authenticated;
REVOKE ALL ON public.native_models FROM anon, authenticated;
GRANT ALL ON public.model_shards TO service_role;
GRANT ALL ON public.shard_replicas TO service_role;
GRANT ALL ON public.native_models TO service_role;

ALTER TABLE public.model_shards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shard_replicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_models ENABLE ROW LEVEL SECURITY;