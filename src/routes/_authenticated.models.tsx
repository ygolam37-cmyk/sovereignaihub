import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, Cpu, Radio } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listModels, submitModel, verifyModel } from "@/lib/registry.functions";

type PeerMod = typeof import("@/lib/peer-node");
async function loadPeer(): Promise<PeerMod> {
  return await import("@/lib/peer-node");
}

export const Route = createFileRoute("/_authenticated/models")({
  component: ModelsPage,
});

type Model = {
  id: string;
  hf_model_id: string;
  display_name: string;
  lane: "fast" | "reasoning" | "code" | "creative";
  status: "pending" | "approved" | "quarantined" | "rejected";
  manifest_sha: string | null;
  submitted_by: string | null;
  notes: string | null;
  last_verified_at: string | null;
};

const LANES = ["fast", "reasoning", "code", "creative"] as const;

function StatusBadge({ status }: { status: Model["status"] }) {
  const map = {
    approved: { icon: ShieldCheck, cls: "text-gold border-gold/40" },
    pending: { icon: ShieldQuestion, cls: "text-muted-foreground border-border" },
    quarantined: { icon: ShieldAlert, cls: "text-orange-400 border-orange-400/40" },
    rejected: { icon: ShieldAlert, cls: "text-red-400 border-red-400/40" },
  } as const;
  const { icon: Icon, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function ModelsPage() {
  const load = useServerFn(listModels);
  const submit = useServerFn(submitModel);
  const verify = useServerFn(verifyModel);
  const [models, setModels] = useState<Model[]>([]);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  const [hfId, setHfId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [lane, setLane] = useState<(typeof LANES)[number]>("fast");
  const [notes, setNotes] = useState("");

  const [peerOn, setPeerOn] = useState(false);
  const [caps, setCaps] = useState<{ webgpu: boolean; webrtc: boolean }>({ webgpu: false, webrtc: false });

  const refresh = useCallback(async () => {
    const r = await load();
    if (r.ok) setModels(r.models as Model[]);
  }, [load]);

  useEffect(() => {
    refresh();
    loadPeer().then((m) => {
      setCaps(m.detectPeerCapabilities());
      setPeerOn(m.isPeerNodeActive());
    });
  }, [refresh]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hfId.trim() || !displayName.trim()) return;
    setBusy(true);
    try {
      const r = await submit({
        data: { hfModelId: hfId.trim(), displayName: displayName.trim(), lane, notes: notes.trim() || undefined },
      });
      if (r.ok) {
        toast.success(
          r.manifestVerified
            ? `Model approved. Manifest SHA: ${r.sha?.slice(0, 12)}…`
            : "Model queued as pending — manifest could not be verified against Hugging Face.",
        );
        setHfId("");
        setDisplayName("");
        setNotes("");
        await refresh();
      } else {
        toast.error(r.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async (hf_model_id: string) => {
    setVerifying(hf_model_id);
    try {
      const r = await verify({ data: { hfModelId: hf_model_id } });
      if (r.ok) toast.success(`Verified. SHA ${r.sha?.slice(0, 12)}…`);
      else if (r.drift) toast.error("SHA drift — model auto-quarantined.");
      else toast.error("Manifest unreachable.");
      await refresh();
    } finally {
      setVerifying(null);
    }
  };

  const togglePeer = async () => {
    const m = await loadPeer();
    if (peerOn) {
      m.stopPeerNode();
      setPeerOn(false);
      toast.info("Peer node stopped.");
    } else {
      const r = await m.startPeerNode();
      if (r.ok) {
        setPeerOn(true);
        toast.success("Peer node online — heartbeating to the network.");
      } else {
        toast.error(r.error ?? "Failed to start peer node.");
      }
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Logo />
          <Link to="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to chat
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div>
            <h1 className="font-display text-3xl">Sovereign Model Registry</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Community-submitted models. Each entry is pinned to a Hugging Face commit SHA — the network auto-quarantines any model whose upstream manifest drifts.
            </p>
          </div>

          <div className="glass overflow-hidden rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Lane</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Manifest</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {models.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No models yet.
                    </td>
                  </tr>
                )}
                {models.map((m) => (
                  <tr key={m.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{m.display_name}</div>
                      <div className="text-[11px] text-muted-foreground">{m.hf_model_id}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{m.lane}</td>
                    <td className="px-3 py-2"><StatusBadge status={m.status} /></td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {m.manifest_sha ? `${m.manifest_sha.slice(0, 10)}…` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onVerify(m.hf_model_id)}
                        disabled={verifying === m.hf_model_id}
                      >
                        {verifying === m.hf_model_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Verify"
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <form onSubmit={onSubmit} className="glass space-y-3 rounded-xl p-4">
            <div className="text-sm font-medium">Submit a model</div>
            <Input
              value={hfId}
              onChange={(e) => setHfId(e.target.value)}
              placeholder="vendor/model[:provider]"
              required
            />
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              required
            />
            <select
              value={lane}
              onChange={(e) => setLane(e.target.value as (typeof LANES)[number])}
              className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
            >
              {LANES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
            />
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Auto-approved if the HF manifest verifies. Otherwise queued as pending.
            </p>
          </form>

          <div className="glass space-y-3 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Radio className="h-4 w-4 text-gold" /> Peer node mode
            </div>
            <div className="text-xs text-muted-foreground">
              Opt in to broadcast this device as a live peer node. Contributes to network health & availability signalling.
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Cpu className="h-3 w-3" />
              WebGPU: <span className={caps.webgpu ? "text-gold" : ""}>{caps.webgpu ? "yes" : "no"}</span>
              &nbsp;·&nbsp;
              WebRTC: <span className={caps.webrtc ? "text-gold" : ""}>{caps.webrtc ? "yes" : "no"}</span>
            </div>
            <Button
              onClick={togglePeer}
              variant={peerOn ? "outline" : "default"}
              className={peerOn ? "" : "w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90"}
            >
              {peerOn ? "Stop peer node" : "Start peer node"}
            </Button>
          </div>
        </aside>
      </main>
    </div>
  );
}
