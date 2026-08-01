import { useEffect } from "react";

/**
 * Mandatory P2P participation: every authenticated session joins the network
 * automatically on mount — no manual opt-in button.
 */
export function PeerAutoConnect() {
  useEffect(() => {
    let stopped = false;
    import("@/lib/peer-node.ts").then(async (m) => {
      if (stopped) return;
      if (!m.isPeerNodeActive()) await m.startPeerNode();
    });
    return () => {
      stopped = true;
    };
  }, []);
  return null;
}
