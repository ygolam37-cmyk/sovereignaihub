import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkStackHealth, type ServiceHealth } from "@/lib/health.functions";
import {
  Server, Brain, Box, Zap, Network, Activity, KeyRound, Shield,
  Lock, Ghost, Database, Share2, RefreshCw, type LucideIcon,
} from "lucide-react";

type Status = "online" | "degraded" | "offline";

type Service = {
  id: string;
  name: string;
  role: string;
  category: string;
  description: string;
  icon: LucideIcon;
  metric: string;
  metricLabel: string;
};

const STACK: Service[] = [
  { id: "linux", name: "Linux", role: "OS Foundation", category: "Core", description: "Hardened kernel — the sovereign base.", icon: Server, metric: "6.8.0", metricLabel: "kernel" },
  { id: "ollama", name: "Ollama", role: "AI Execution", category: "Intelligence", description: "Local LLM runtime — zero cloud calls.", icon: Brain, metric: "4", metricLabel: "models loaded" },
  { id: "docker", name: "Docker", role: "Deployment", category: "Core", description: "Containerized, reproducible workloads.", icon: Box, metric: "12", metricLabel: "containers" },
  { id: "redis", name: "Redis", role: "Caching / Speed", category: "Performance", description: "In-memory cache for 100× latency cuts.", icon: Zap, metric: "1.2ms", metricLabel: "p99 latency" },
  { id: "nginx", name: "Nginx", role: "Traffic Management", category: "Performance", description: "High-throughput reverse proxy edge.", icon: Network, metric: "8.4k", metricLabel: "req/s" },
  { id: "prometheus", name: "Prometheus", role: "Monitoring", category: "Observability", description: "Time-series telemetry & alerting.", icon: Activity, metric: "312", metricLabel: "active targets" },
  { id: "vault", name: "Vault", role: "Secret Management", category: "Security", description: "Encrypted credential broker.", icon: KeyRound, metric: "AES-256", metricLabel: "at rest" },
  { id: "ufw", name: "UFW", role: "Firewall", category: "Security", description: "Perimeter defense — deny by default.", icon: Shield, metric: "deny", metricLabel: "default policy" },
  { id: "wireguard", name: "WireGuard", role: "Encryption", category: "Network", description: "Encrypted tunnels — modern, minimal.", icon: Lock, metric: "ChaCha20", metricLabel: "cipher" },
  { id: "tor", name: "Tor", role: "Ghost Mode", category: "Network", description: "Onion routing for full anonymity.", icon: Ghost, metric: "3-hop", metricLabel: "circuit" },
  { id: "ipfs", name: "IPFS", role: "Decentralized Storage", category: "Data", description: "Content-addressed, censorship-resistant.", icon: Database, metric: "428", metricLabel: "pinned CIDs" },
  { id: "qbittorrent", name: "qBittorrent", role: "P2P Distribution", category: "Data", description: "Decentralized file distribution.", icon: Share2, metric: "↑ 24MB/s", metricLabel: "swarm" },
];

const STATUS_STYLES: Record<Status, { dot: string; label: string; text: string }> = {
  online:   { dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]", label: "Online",   text: "text-emerald-400" },
  degraded: { dot: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]",   label: "Degraded", text: "text-amber-400" },
  offline:  { dot: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]",     label: "Offline",  text: "text-rose-400" },
};

function formatAgo(iso: string, now: number): string {
  const diff = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function SovereignStack() {
  const run = useServerFn(checkStackHealth);
  const [health, setHealth] = useState<Record<string, ServiceHealth>>({});
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await run();
      if (r.ok) {
        setHealth(r.services);
        setCheckedAt(r.checkedAt);
      }
    } catch (e) {
      console.error("[SovereignStack] health check failed", e);
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    const c = setInterval(() => setNow(Date.now()), 1_000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [refresh]);

  const statuses = STACK.map((s) => health[s.id]?.status ?? "degraded");
  const online = statuses.filter((s) => s === "online").length;
  const degraded = statuses.filter((s) => s === "degraded").length;
  const offline = statuses.filter((s) => s === "offline").length;
  const healthPct = Math.round((online / STACK.length) * 100);

  return (
    <section className="space-y-6">
      <div className="glass relative overflow-hidden rounded-2xl p-6 shadow-elegant">
        <div className="absolute inset-0 bg-gradient-radial opacity-40" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Sovereign AI Architecture</div>
            <h2 className="mt-1 font-display text-3xl text-gradient-gold">Local · Encrypted · Decentralized</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Live probes against 12 open-source pillars. Status refreshes every 15s.
            </p>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>Last sweep: <span className="font-mono text-gold">{checkedAt ? formatAgo(checkedAt, now) : "—"}</span></span>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-gold disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                Re-probe
              </button>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Metric value={`${healthPct}%`} label="Stack health" />
            <Metric value={`${online}/${STACK.length}`} label="Online" />
            <Metric value={`${degraded}·${offline}`} label="Degr · Off" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {STACK.map((s) => {
          const Icon = s.icon;
          const h = health[s.id];
          const status: Status = h?.status ?? "degraded";
          const st = STATUS_STYLES[status];
          const pulse = status === "online";
          return (
            <div
              key={s.id}
              className="glass group relative overflow-hidden rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-gold"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-gold text-primary-foreground shadow-gold">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display text-lg leading-tight">{s.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {s.role}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${st.dot} ${pulse ? "animate-pulse" : ""}`} />
                    <span className={`text-[10px] font-medium uppercase ${st.text}`}>{st.label}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    {h?.probe === "http" ? "live probe" : h?.probe === "simulated" ? "synth heartbeat" : "pending"}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{s.description}</p>

              <div className="mt-3 rounded-md border border-border/40 bg-background/30 px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground/90 line-clamp-2">
                  {h?.detail ?? "Awaiting first probe…"}
                </div>
                <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  <span>{h?.target ?? s.role}</span>
                  <span className="font-mono text-gold/80">
                    {h?.latencyMs != null ? `${h.latencyMs}ms` : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-end justify-between border-t border-border/40 pt-3">
                <div>
                  <div className="font-mono text-sm text-gold">{s.metric}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.metricLabel}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">checked</div>
                  <div className="font-mono text-[10px] text-gold/80">
                    {h ? formatAgo(h.checkedAt, now) : "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-gold" />
          Probes run from the edge — configure local URLs via env (OLLAMA_URL, PROM_URL, VAULT_URL, IPFS_API_URL, QBIT_URL…) for true live checks.
        </span>
        <span className="font-mono text-gold/80">SOV-NET // ghost mode armed</span>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right">
      <div className="font-display text-2xl text-gradient-gold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
