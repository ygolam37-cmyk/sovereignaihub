
DROP POLICY IF EXISTS "Anyone can submit models" ON public.model_registry;
DROP POLICY IF EXISTS "Anyone can register a peer" ON public.peer_nodes;
DROP POLICY IF EXISTS "Anyone can heartbeat their peer" ON public.peer_nodes;

REVOKE INSERT ON public.model_registry FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.peer_nodes FROM anon, authenticated;
