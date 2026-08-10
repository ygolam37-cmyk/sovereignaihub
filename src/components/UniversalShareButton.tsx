/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { networkStatus } from "@/lib/search.functions";
import { Button } from "@/components/ui/button";
import { Share2, Copy, Check, Radio, Globe, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  generateAndHost,
  UNIFIED_MESH_ROOM,
  UNIFIED_NAMESPACE,
  type HostResult,
} from "@/lib/p2p-share";

type Props = {
  /** Title shown to whoever opens the link. */
  title?: string;
  /** Arbitrary app state serialized into the P2P snapshot. */
  payload?: unknown;
};

export function UniversalShareButton({ title = "Sovereign snapshot", payload = {} }: Props) {
  const fetchStatus = useServerFn(networkStatus);
  const [result, setResult] = useState<HostResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [peers, setPeers] = useState(0);
  const [meshPeers, setMeshPeers] = useState(1);
  const [live, setLive] = useState(false);
  const chanRef = useRef<BroadcastChannel | null>(null);

  // Unified mesh presence: every device joins the SAME room name.
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    const seen = new Map<string, number>();
    try {
      ch = new BroadcastChannel(UNIFIED_MESH_ROOM);
      chanRef.current = ch;
      const self = crypto.randomUUID();
      ch.onmessage = (e) => {
        const d = e.data as { type?: string; id?: string };
        if (d?.type === "presence" && d.id) {
          seen.set(d.id, Date.now());
          setMeshPeers(1 + seen.size);
        }
      };
      const beat = () => {
        ch?.postMessage({ type: "presence", id: self });
        const cutoff = Date.now() - 15_000;
        for (const [k, v] of seen) if (v < cutoff) seen.delete(k);
        setMeshPeers(1 + seen.size);
      };
      beat();
      const t = setInterval(beat, 5_000);
      setLive(true);
      return () => {
        clearInterval(t);
        ch?.close();
      };
    } catch {
      setLive(false);
      return;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchStatus();
        if (alive && r.ok) setPeers(r.peers ?? 0);
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [fetchStatus]);

  const share = useCallback(() => {
    const r = generateAndHost(title, payload);
    setResult(r);
    setCopied(false);
    void navigator.clipboard?.writeText(r.url).then(
      () => setCopied(true),
      () => undefined,
    );
    toast.success(`Hosted on P2P in ${r.ms.toFixed(3)} ms`, {
      description: `${r.snap.domain}${UNIFIED_NAMESPACE.replace("/", ".")}`,
    });
    if (typeof navigator !== "undefined" && "share" in navigator) {
      void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
        .share({ title, url: r.url })
        .catch(() => undefined);
    }
  }, [title, payload]);

  const copy = () => {
    if (!result) return;
    void navigator.clipboard?.writeText(result.url).then(() => {
      setCopied(true);
      toast.success("Link copied");
    });
  };

  return (
    <div className="glass rounded-2xl p-5 shadow-elegant">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className={`h-3.5 w-3.5 ${live ? "text-gold" : "text-muted-foreground/50"}`} />
          <span>{live ? "P2P mesh live" : "mesh unavailable"}</span>
          <span className="text-muted-foreground/40">·</span>
          <Globe className="h-3.5 w-3.5 text-gold" />
          <span className="font-mono">
            {meshPeers} local · {peers} network
          </span>
        </div>
        <span className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {UNIFIED_NAMESPACE} · unified namespace
        </span>
      </div>

      <Button
        onClick={share}
        size="lg"
        className="mt-4 w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
      >
        <Share2 className="mr-2 h-4 w-4" />
        Universal Share
      </Button>

      {result && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-gold">
            <Zap className="h-3.5 w-3.5" />
            <span className="font-mono">deployed in {result.ms.toFixed(3)} ms</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-card/40 px-3 py-2 font-mono text-xs">
              {result.url}
            </code>
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copy share link">
              {copied ? <Check className="h-4 w-4 text-gold" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Domain <span className="font-mono text-foreground">{result.snap.domain}</span> generated with
            Web Crypto randomness. The snapshot travels inside the link fragment and the unified mesh room —
            it never touches a server.
          </p>
        </div>
      )}
    </div>
  );
}
