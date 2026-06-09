import { useEffect, useState } from "react";
import {
  Server, Brain, Box, Zap, Network, Activity, KeyRound, Shield,
  Lock, Ghost, Database, Share2, type LucideIcon,
} from "lucide-react";

type Status = "online" | "degraded" | "offline";

type Service = {
  id: string;
  name: string;
  role: string;
  category: string;
  description: string;
  icon: LucideIcon;
  status: Status;
  metric: string;
  metricLabel: string;
};

const STACK: Service[] = [
  { id: "linux", name: "Linux", role: "OS Foundation", category: "Core", description: "Hardened kernel — the sovereign base.", icon: Server, status: "online", metric: "6.8.0", metricLabel: "kernel" },
  { id: "ollama", name: "Ollama", role: "AI Execution", category: "Intelligence", description: "Local LLM runtime — zero cloud calls.", icon: Brain, status: "online", metric: "4", metricLabel: "models loaded" },
  { id: "docker", name: "Docker", role: "Deployment", category: "Core", description: "Containerized, reproducible workloads.", icon: Box, status: "online", metric: "12", metricLabel: "containers" },
  { id: "redis", name: "Redis", role: "Caching / Speed", category: "Performance", description: "In-memory cache for 100× latency cuts.", icon: Zap, status: "online", metric: "1.2ms", metricLabel: "p99 latency" },
  { id: "nginx", name: "Nginx", role: "Traffic Management", category: "Performance", description: "High-throughput reverse proxy edge.", icon: Network, status: "online", metric: "8.4k", metricLabel: "req/s" },
  { id: "prometheus", name: "Prometheus", role: "Monitoring", category: "Observability", description: "Time-series telemetry & alerting.", icon: Activity, status: "online", metric: "312", metricLabel: "active targets" },
  { id: "vault", name: "Vault", role: "Secret Management", category: "Security", description: "Encrypted credential broker.", icon: KeyRound, status: "online", metric: "AES-256", metricLabel: "at rest" },
  { id: "ufw", name: "UFW", role: "Firewall", category: "Security", description: "Perimeter defense — deny by default.", icon: Shield, status: "online", metric: "deny", metricLabel: "default policy" },
  { id: "wireguard", name: "WireGuard", role: "Encryption", category: "Network", description: "Encrypted tunnels — modern, minimal.", icon: Lock, status: "online", metric: "ChaCha20", metricLabel: "cipher" },
  { id: "tor", name: "Tor", role: "Ghost Mode", category: "Network", description: "Onion routing for full anonymity.", icon: Ghost, status: "degraded", metric: "3-hop", metricLabel: "circuit" },
  { id: "ipfs", name: "IPFS", role: "Decentralized Storage", category: "Data", description: "Content-addressed, censorship-resistant.", icon: Database, status: "online", metric: "428", metricLabel: "pinned CIDs" },
  { id: "qbittorrent", name: "qBittorrent", role: "P2P Distribution", category: "Data", description: "Decentralized file distribution.", icon: Share2, status: "online", metric: "↑ 24MB/s", metricLabel: "swarm" },
];

const STATUS_STYLES: Record<Status, { dot: string; label: string; text: string }> = {
  online:   { dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]", label: "Online",   text: "text-emerald-400" },
  degraded: { dot: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]",   label: "Degraded", text: "text-amber-400" },
  offline:  { dot: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]",     label: "Offline",  text: "text-rose-400" },
};

export function SovereignStack() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 4000);
    return () => clearInterval(t);
  }, []);

  const online = STACK.filter((s) => s.status === "online").length;
  const health = Math.round((online / STACK.length) * 100);

  return (
    <section className="space-y-6">
      {/* Header / Architecture summary */}
      <div className="glass relative overflow-hidden rounded-2xl p-6 shadow-elegant">
        <div className="absolute inset-0 bg-gradient-radial opacity-40" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Sovereign AI Architecture</div>
            <h2 className="mt-1 font-display text-3xl text-gradient-gold">Local · Encrypted · Decentralized</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              12 open-source pillars guarantee that intelligence, data, and traffic
              never leave your sovereign perimeter.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <Metric value={`${health}%`} label="Stack health" />
            <Metric value={`${online}/${STACK.length}`} label="Services up" />
            <Metric value="100%" label="Open-source" />
          </div>
        </div>
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {STACK.map((s, idx) => {
          const Icon = s.icon;
          const st = STATUS_STYLES[s.status];
          const pulse = (tick + idx) % 4 === 0;
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
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${st.dot} ${pulse ? "animate-pulse" : ""}`} />
                  <span className={`text-[10px] font-medium uppercase ${st.text}`}>{st.label}</span>
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{s.description}</p>

              <div className="mt-4 flex items-end justify-between border-t border-border/40 pt-3">
                <div>
                  <div className="font-mono text-sm text-gold">{s.metric}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.metricLabel}
                  </div>
                </div>
                <span className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.category}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust footer */}
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-gold" />
          Zero telemetry leaves the perimeter — verified at the firewall edge.
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
