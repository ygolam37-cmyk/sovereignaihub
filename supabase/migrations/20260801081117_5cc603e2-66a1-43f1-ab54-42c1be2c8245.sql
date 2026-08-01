DROP POLICY IF EXISTS "Public can read peer nodes" ON public.peer_nodes;
DROP POLICY IF EXISTS "Public can read verification history" ON public.model_verifications;

REVOKE SELECT ON public.peer_nodes FROM anon, authenticated;
REVOKE SELECT ON public.model_verifications FROM anon, authenticated;

GRANT ALL ON public.peer_nodes TO service_role;
GRANT ALL ON public.model_verifications TO service_role;