import { useEffect } from "react";

/**
 * Mandatory P2P participation: every authenticated session joins the native
 * mesh automatically — capability measurement, shard auto-download and peer
 * serving all start without any manual opt-in.
 */
export function PeerAutoConnect() {
  useEffect(() => {
    let stopped = false;
    import("@/lib/mesh-engine").then(async (m) => {
      if (stopped) return;
      if (!m.isMeshRunning()) await m.startMesh();
    });
    return () => {
      stopped = true;
    };
  }, []);
  return null;
}
