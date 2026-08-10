/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Globe, Radio, ShieldCheck } from "lucide-react";
import {
  UNIFIED_MESH_ROOM,
  cacheSnapshot,
  resolveFromHash,
  type ShareSnapshot,
} from "@/lib/p2p-share";

export const Route = createFileRoute("/net")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Unified P2P Namespace — Sovereign AI" },
      {
        name: "description",
        content:
          "Every Sovereign share resolves here: one unified P2P namespace, cryptographic domains, zero server-side storage.",
      },
      { property: "og:title", content: "Unified P2P Namespace — Sovereign AI" },
      {
        property: "og:description",
        content:
          "Every Sovereign share resolves here: one unified P2P namespace, cryptographic domains, zero server-side storage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NetNamespace,
});

function NetNamespace() {
  const [snap, setSnap] = useState<ShareSnapshot | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [meshPeers, setMeshPeers] = useState(1);

  useEffect(() => {
    const apply = () => {
      const r = resolveFromHash(window.location.hash);
      setDomain(r?.domain ?? null);
      setSnap(r?.snap ?? null);
      if (r?.snap) cacheSnapshot(r.snap);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    const seen = new Map<string, number>();
    try {
      ch = new BroadcastChannel(UNIFIED_MESH_ROOM);
      const self = crypto.randomUUID();
      ch.onmessage = (e) => {
        const d = e.data as { type?: string; id?: string; snap?: ShareSnapshot };
        if (d?.type === "presence" && d.id) {
          seen.set(d.id, Date.now());
          setMeshPeers(1 + seen.size);
        }
        if (d?.type === "host" && d.snap) cacheSnapshot(d.snap);
      };
      const beat = () => {
        ch?.postMessage({ type: "presence", id: self });
        const cutoff = Date.now() - 15_000;
        for (const [k, v] of seen) if (v < cutoff) seen.delete(k);
        setMeshPeers(1 + seen.size);
      };
      beat();
      const t = setInterval(beat, 5_000);
      return () => {
        clearInterval(t);
        ch?.close();
      };
    } catch {
      return;
    }
  }, []);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <Logo />
        <Link to="/">
          <Button variant="outline" size="sm">
            Home
          </Button>
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24">
        <h1 className="font-display text-4xl">
          Unified <span className="text-gradient-gold">P2P namespace</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Every device, peer, and share link anchors to this single address. Nothing is fragmented across
          endpoints and no snapshot is stored on a server.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
          <span className="glass flex items-center gap-2 rounded-xl px-3 py-2">
            <Radio className="h-3.5 w-3.5 text-gold" /> mesh live
          </span>
          <span className="glass flex items-center gap-2 rounded-xl px-3 py-2">
            <Globe className="h-3.5 w-3.5 text-gold" />
            <span className="font-mono">{meshPeers} node(s) on this namespace</span>
          </span>
          <span className="glass flex items-center gap-2 rounded-xl px-3 py-2">
            <ShieldCheck className="h-3.5 w-3.5 text-gold" /> crypto-random domain
          </span>
        </div>

        <section className="glass mt-8 rounded-2xl p-6 shadow-elegant">
          {!domain && (
            <p className="text-sm text-muted-foreground">
              No domain in the address. Open a Universal Share link to resolve a hosted snapshot here.
            </p>
          )}
          {domain && (
            <>
              <div className="text-xs text-muted-foreground">Domain</div>
              <div className="font-mono text-lg text-gold">{domain}</div>
              {snap ? (
                <div className="mt-5 space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Title</div>
                    <div className="text-base">{snap.title}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Hosted at</div>
                    <div className="font-mono text-sm">{new Date(snap.createdAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Snapshot</div>
                    <pre className="mt-1 max-h-80 overflow-auto rounded-lg border border-border/60 bg-card/40 p-3 font-mono text-xs">
                      {JSON.stringify(snap.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  This domain isn't hosted by any peer reachable from this device yet. Keep the tab open —
                  it resolves the moment a hosting peer joins the namespace.
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
