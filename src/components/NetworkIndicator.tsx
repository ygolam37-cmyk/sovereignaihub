/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { networkStatus } from "@/lib/search.functions";
import { Activity } from "lucide-react";

type Node = { id: string; label: string; up: boolean };

export function NetworkIndicator() {
  const fetchStatus = useServerFn(networkStatus);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [strength, setStrength] = useState(0);
  const [peers, setPeers] = useState(0);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let stopped = false;
    import("@/lib/webrtc-mesh").then((m) => {
      if (stopped) return;
      unsub = m.subscribeMeshPeers(setPeers);
    });
    return () => {
      stopped = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchStatus();
        if (alive && r.ok) {
          setNodes(r.nodes);
          setStrength(r.strength);
        }
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [fetchStatus]);

  return (
    <div className="glass flex items-center gap-3 rounded-xl px-3 py-2 text-xs">
      <Activity className="h-3.5 w-3.5 text-gold" />
      <span className="text-muted-foreground">Network</span>
      <div className="flex items-center gap-2">
        {nodes.map((n) => (
          <span key={n.id} className="flex items-center gap-1">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${n.up ? "bg-gold" : "bg-muted-foreground/40"}`}
              aria-hidden
            />
            <span className={n.up ? "text-foreground" : "text-muted-foreground/60"}>{n.label}</span>
          </span>
        ))}
      </div>
      <span className="flex items-center gap-1 font-mono text-gold">
        <span className="text-muted-foreground">peers</span>
        {peers}
      </span>
      <span className="ml-1 font-mono text-gold">{strength}%</span>
    </div>
  );
}
