import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Cpu, HardDrive, UploadCloud, ShieldCheck, Network } from "lucide-react";
import { publishModel, verifyModel, listNativeModels, meshStats } from "@/lib/p2p.functions";
import { planShards, sliceShard, DEFAULT_SHARD_SIZE } from "@/lib/shard";
import { supabase } from "@/integrations/supabase/client";
import { subscribeMesh, forceSync, type MeshState } from "@/lib/mesh-engine";

export const Route = createFileRoute("/_authenticated/models")({
  head: () => ({
    meta: [
      { title: "P2P Model Mesh — Sovereign AI" },
      {
        name: "description",
        content:
          "Upload model weights, shard them, and distribute execution across the sovereign peer-to-peer mesh with no external AI provider.",
      },
      { property: "og:title", content: "P2P Model Mesh — Sovereign AI" },
      {
        property: "og:description",
        content: "Native sharded model distribution across peer devices — no external APIs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ModelsPage,
});

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

type ModelRow = {
  id: string;
  name: string;
  kind: string;
  size_bytes: number;
  shard_count: number;
  shard_size: number;
  merkle_root: string | null;
  status: string;
  notes: string | null;
  verified_at: string | null;
};

function ModelsPage() {
  const doPublish = useServerFn(publishModel);
  const doVerify = useServerFn(verifyModel);
  const doList = useServerFn(listNativeModels);
  const doStats = useServerFn(meshStats);

  const [mesh, setMesh] = useState<MeshState | null>(null);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof meshStats>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");

  useEffect(() => subscribeMesh(setMesh), []);

  const refresh = useCallback(async () => {
    const [m, s] = await Promise.all([doList(), doStats()]);
    if (m.ok) setModels(m.models as ModelRow[]);
    if (s.ok) setStats(s);
  }, [doList, doStats]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const onUpload = async (file: File) => {
    setBusy("sharding");
    try {
      setProgress({ label: "Hashing shards", done: 0, total: 1 });
      const plan = await planShards(file, DEFAULT_SHARD_SIZE, (done, total) =>
        setProgress({ label: "Hashing shards", done, total }),
      );

      const kind = /\.(bin|safetensors|gguf|pt|onnx)$/i.test(file.name)
        ? "weights"
        : /\.(json|js|wasm)$/i.test(file.name)
          ? "algorithm"
          : "binary";

      setBusy("publishing");
      const pub = await doPublish({
        data: {
          name: name.trim() || file.name,
          kind: kind as "weights" | "algorithm" | "binary",
          sizeBytes: plan.sizeBytes,
          shardSize: plan.shardSize,
          merkleRoot: plan.merkleRoot,
          shards: plan.shards,
        },
      });
      if (!pub.ok) throw new Error(pub.error);

      setBusy("seeding");
      let done = 0;
      for (const ticket of pub.tickets) {
        const blob = sliceShard(file, ticket.idx, plan.shardSize);
        const { error } = await supabase.storage
          .from(pub.bucket)
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { upsert: true });
        if (error) throw new Error(`Shard ${ticket.idx}: ${error.message}`);
        done++;
        setProgress({ label: "Seeding shards", done, total: pub.tickets.length });
      }

      setBusy("verifying");
      const ver = await doVerify({ data: { modelId: pub.modelId } });
      if (!ver.ok) throw new Error(ver.error);
      toast.success(`Verified & live — ${ver.checked}/${ver.total} shards, executing on the mesh.`);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      forceSync();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-10 border-b border-border/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Logo />
          <Link to="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Chat
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-3xl">P2P Model Mesh</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Fully native distribution engine. Models are sharded, content-addressed, verified by
            Merkle root, and streamed to peer devices — no Hugging Face, no external AI provider.
          </p>
        </div>

        {/* This device */}
        <section className="glass rounded-2xl p-5">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Cpu className="h-4 w-4 text-gold" /> This device
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Metric label="Strength" value={`${mesh?.caps?.score ?? 0}/100`} />
            <Metric label="Tier" value={mesh?.caps?.tier ?? "—"} />
            <Metric label="WebGPU" value={mesh?.caps?.webgpu ? "yes" : "no"} />
            <Metric label="Cores" value={String(mesh?.caps?.cores ?? "—")} />
            <Metric label="RAM" value={mesh?.caps?.memoryGb ? `${mesh.caps.memoryGb} GB` : "n/a"} />
            <Metric
              label="Battery"
              value={
                mesh?.caps?.batteryLevel === null || mesh?.caps?.batteryLevel === undefined
                  ? "n/a"
                  : `${Math.round(mesh.caps.batteryLevel * 100)}%${mesh.caps.charging ? " ⚡" : ""}`
              }
            />
            <Metric label="Shards held" value={`${mesh?.held ?? 0}`} />
            <Metric label="Cached" value={fmtBytes(mesh?.heldBytes ?? 0)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3 text-gold" />
              {fmtBytes(mesh?.usage ?? 0)} used of {fmtBytes(mesh?.quota ?? 0)} quota · budget{" "}
              {fmtBytes(mesh?.budget ?? 0)}
            </span>
            <span>assigned {mesh?.assigned ?? 0}</span>
            <span>from peers {mesh?.fromPeers ?? 0}</span>
            <span>from seed {mesh?.fromSeed ?? 0}</span>
            <span>retries/failures {mesh?.failures ?? 0}</span>
            <span className="text-gold">{mesh?.downloading ?? mesh?.message ?? "idle"}</span>
            {mesh?.quotaBlocked && <span className="text-rose-400">storage full — evicting LRU</span>}
          </div>
        </section>

        {/* Upload */}
        <section className="glass rounded-2xl p-5">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <UploadCloud className="h-4 w-4 text-gold" /> Submit model / weights / binary
          </h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Display name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="sm:max-w-xs"
            />
            <input
              ref={fileRef}
              type="file"
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-gradient-gold file:px-4 file:py-2 file:text-primary-foreground"
            />
          </div>
          {progress && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-gold transition-all"
                  style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {progress.label} {progress.done}/{progress.total} · {busy}
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Files are split into {fmtBytes(DEFAULT_SHARD_SIZE)} shards, hashed with SHA-256 in your
            browser, seeded once, then re-served peer-to-peer. Max 256 MB.
          </p>
        </section>

        {/* Mesh */}
        <section className="glass rounded-2xl p-5">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Network className="h-4 w-4 text-gold" /> Mesh
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Metric label="Live nodes" value={String(stats?.liveNodes ?? 0)} />
            <Metric
              label="Tiers"
              value={`${stats?.tiers.heavy ?? 0}H / ${stats?.tiers.medium ?? 0}M / ${stats?.tiers.light ?? 0}L`}
            />
            <Metric label="Shard coverage" value={`${stats?.coverage ?? 0}%`} />
            <Metric label="Under-replicated" value={String(stats?.underReplicated ?? 0)} />
          </div>
          {stats?.peers.length ? (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {stats.peers.slice(0, 8).map((p) => (
                <div key={p.nodeKey} className="flex justify-between font-mono">
                  <span>{p.nodeKey}</span>
                  <span>
                    {p.tier} · {p.score}/100
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Models */}
        <section className="glass rounded-2xl p-5">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <ShieldCheck className="h-4 w-4 text-gold" /> Registered models
          </h2>
          {models.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No models submitted yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {models.map((m) => (
                <div key={m.id} className="rounded-xl border border-border/40 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{m.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        m.status === "live"
                          ? "bg-gold/15 text-gold"
                          : m.status === "quarantined"
                            ? "bg-rose-500/15 text-rose-400"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.kind} · {fmtBytes(m.size_bytes)} · {m.shard_count} shards of{" "}
                    {fmtBytes(m.shard_size)} · root {m.merkle_root?.slice(0, 12)}…
                  </div>
                  {m.notes && <div className="mt-1 text-xs text-muted-foreground/80">{m.notes}</div>}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    disabled={!!busy}
                    onClick={async () => {
                      const r = await doVerify({ data: { modelId: m.id } });
                      if (r.ok) toast.success(`Integrity OK — ${r.checked}/${r.total} shards`);
                      else toast.error(r.error);
                      await refresh();
                    }}
                  >
                    Re-verify integrity
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-gold">{value}</div>
    </div>
  );
}
