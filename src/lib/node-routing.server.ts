// In-memory per-worker health map for the sovereign's own subsystems.
// There are no third-party providers left to track — only native components.

type NodeId = "native-engine" | "open-web" | "p2p-mesh";

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
  const ids: NodeId[] = ["native-engine", "open-web", "p2p-mesh"];
  return ids.map((id) => {
    const h = health.get(id);
    const up = !h || Date.now() > h.downUntil;
    return { id, up, reason: up ? undefined : h?.lastError };
  });
}
