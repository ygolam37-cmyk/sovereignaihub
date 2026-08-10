import { useEffect } from "react";

/**
 * Mandatory P2P participation: every authenticated session joins the native
 * mesh automatically — capability measurement, shard auto-download and peer
 * serving all start without any manual opt-in.
 */
export function PeerAutoConnect() {
  useEffect(() => {
    let stopped = false;
    void (async () => {
      const { ensureGate } = await import("@/lib/gate-client");
      await ensureGate();
      const m = await import("@/lib/mesh-engine");
      if (stopped) return;
      if (!m.isMeshRunning()) await m.startMesh();
    })();
    return () => {
      stopped = true;
    };
  }, []);
  return null;
}
