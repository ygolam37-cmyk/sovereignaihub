// In-memory per-worker health map for upstream provider nodes.
// Best-effort — workers may not share state, but each will independently
// mark failing nodes down for 60s and re-route.

type NodeId = "hf-router" | "hf-direct" | "lovable-ai";

type Health = { downUntil: number; lastError?: string };

const health = new Map<NodeId, Health>();

const DOWN_MS = 60_000;

export function isNodeUp(id: NodeId): boolean {
  const h = health.get(id);
  if (!h) return true;
  if (Date.now() > h.downUntil) {
    health.delete(id);
    return true;
  }
  return false;
}

export function markNodeDown(id: NodeId, reason: string): void {
  health.set(id, { downUntil: Date.now() + DOWN_MS, lastError: reason });
}

export function healthSnapshot(): Array<{ id: NodeId; up: boolean; reason?: string }> {
  const ids: NodeId[] = ["hf-router", "hf-direct", "lovable-ai"];
  return ids.map((id) => {
    const h = health.get(id);
    const up = !h || Date.now() > h.downUntil;
    return { id, up, reason: up ? undefined : h?.lastError };
  });
}
