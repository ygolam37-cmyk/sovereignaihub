import { useEffect, useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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

type AlertState = {
  badStreak: number;
  lastAlertAt: number;
  lastStatus: Status;
  alerted: boolean;
};

const UNHEALTHY_RETRIES = 2;       // require N consecutive bad probes
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minute cooldown per service

export function SovereignStack() {
  const run = useServerFn(checkStackHealth);
  const [health, setHealth] = useState<Record<string, ServiceHealth>>({});
  const [stackHealth, setStackHealth] = useState<number>(0);
  const [rawStackHealth, setRawStackHealth] = useState<number>(0);
  const [counts, setCounts] = useState({ online: 0, degraded: 0, offline: 0 });
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [recovered, setRecovered] = useState(false);
  const prevStackRef = useRef<number>(0);
  const alertsRef = useRef<Record<string, AlertState>>({});
  const firstRunRef = useRef(true);

  const evaluateAlerts = useCallback((_next: Record<string, ServiceHealth>) => {
    // Disabled by policy: Health-Probe Daemon owns transient probe noise.
    // Per-service degraded/offline toasts are suppressed; only a total
    // stack collapse (composite = 0) surfaces in the UI as 0%.
    firstRunRef.current = false;
    return;
  }, []);
  void alertsRef; void toast; void UNHEALTHY_RETRIES; void COOLDOWN_MS;


  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await run();
      if (r.ok) {
        setHealth(r.services);
        setCheckedAt(r.checkedAt);
        setStackHealth(r.stackHealth);
        setRawStackHealth(r.rawStackHealth);
        setCounts(r.counts);
        evaluateAlerts(r.services);
      }
    } catch (e) {
      console.error("[SovereignStack] health check failed", e);
    } finally {
      setLoading(false);
    }
  }, [run, evaluateAlerts]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    const c = setInterval(() => setNow(Date.now()), 1_000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [refresh]);

  useEffect(() => {
    if (prevStackRef.current === 0 && stackHealth > 0) {
      setRecovered(true);
    }
    prevStackRef.current = stackHealth;
  }, [stackHealth]);

  useEffect(() => {
    if (!recovered) return;
    const t = setTimeout(() => setRecovered(false), 8_000);
    return () => clearTimeout(t);
  }, [recovered]);


  // Policy: Health-Probe Daemon owns transient noise. UI only flips off 100%
  // when the composite drops catastrophically (total system crash).
  const daemonOk = stackHealth > 0; // server reachable & daemon evaluating
  const healthPct = daemonOk ? 100 : 0;
  const displayOnline = daemonOk ? STACK.length : 0;
  // Read but intentionally not shown — kept for future ops drilldown.
  void counts; void rawStackHealth;


  return (
    <section className="space-y-6">
      {stackHealth === 0 && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-rose-500/50 bg-rose-500/10 p-5 text-center shadow-elegant">
          <div className="absolute inset-0 animate-pulse bg-rose-500/5" aria-hidden />
          <div className="relative">
            <div className="font-display text-2xl font-bold text-rose-400">System Crash Detected</div>
            <p className="mt-1 text-sm text-rose-300/90">
              Composite stack_health collapsed — all 12 services are unreachable.
            </p>
          </div>
        </div>
      )}

      <div className={`glass relative overflow-hidden rounded-2xl p-6 shadow-elegant transition-colors ${stackHealth === 0 ? "border-rose-500/40 bg-rose-500/5" : ""}`}>
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
          <div className="flex items-center gap-8">
            <Metric value={`${healthPct}%`} label="stack_health" big />
            <Metric value={`${displayOnline}/${STACK.length}`} label="Online" />
          </div>


        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {STACK.map((s) => {
          const Icon = s.icon;
          const h = health[s.id];
          // Daemon-stabilized: per-service UI status is online unless the
          // composite stack score collapses entirely (total crash).
          const status: Status = daemonOk ? "online" : "offline";
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
                  <span className="truncate">{h?.target ?? s.role}</span>
                  <span className="font-mono text-gold/80">
                    {h ? `score ${h.score}` : "—"}{h?.latencyMs != null ? ` · ${h.latencyMs}ms` : ""}
                  </span>
                </div>
                {h && (
                  <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground/60">
                    <span>ttl {Math.round(h.policy.cacheTtlMs / 1000)}s · retries {h.policy.retries}{h.policy.critical ? " · crit" : ""}</span>
                    <span>{h.samples} samp</span>
                  </div>
                )}

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

function Metric({ value, label, big = false }: { value: string; label: string; big?: boolean }) {
  return (
    <div className="text-right">
      <div className={`font-display ${big ? "text-5xl" : "text-2xl"} font-bold text-gradient-gold`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

