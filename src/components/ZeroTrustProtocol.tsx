import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getZeroTrustState, type ZeroTrustResponse } from "@/lib/zerotrust.functions";
import {
  ShieldCheck, FlaskConical, ScrollText, AlertTriangle, RefreshCw,
  CheckCircle2, XCircle, Lock, Activity,
} from "lucide-react";

const STAGE_LABEL: Record<string, string> = {
  "static-scan": "Static scan",
  "cve-check": "CVE check",
  "sandbox-exec": "Sandbox exec",
  "verdict": "Verdict",
};

const VERDICT_STYLE: Record<string, { text: string; dot: string; label: string }> = {
  trusted:     { text: "text-emerald-400", dot: "bg-emerald-400", label: "Trusted" },
  quarantined: { text: "text-amber-400",   dot: "bg-amber-400",   label: "Quarantined" },
  rejected:    { text: "text-rose-400",    dot: "bg-rose-500",    label: "Rejected" },
  pending:     { text: "text-sky-400",     dot: "bg-sky-400",     label: "Auditing" },
};

const SEVERITY_STYLE: Record<string, string> = {
  info: "text-sky-400",
  warn: "text-amber-400",
  critical: "text-rose-400",
};

function ago(iso: string, now: number) {
  const d = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (d < 5) return "just now";
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

export function ZeroTrustProtocol() {
  const run = useServerFn(getZeroTrustState);
  const [state, setState] = useState<ZeroTrustResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await run();
      if (r.ok) setState(r);
    } catch (e) {
      console.error("[ZeroTrust] fetch failed", e);
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

  const ph = state?.protocolHealth ?? 0;

  return (
    <section className="space-y-4">
      <div className="glass relative overflow-hidden rounded-2xl p-6 shadow-elegant">
        <div className="absolute inset-0 bg-gradient-radial opacity-40" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Zero-Trust Security Protocol</div>
            <h2 className="mt-1 font-display text-2xl text-gradient-gold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-gold" />
              Continuous Monitoring Bridge
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Serverless audit pipeline · sandbox proving ground · self-diagnostic loop · auto-quarantine.
              No local installs, no API keys — results stream to the dashboard.
            </p>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>Last sweep: <span className="font-mono text-gold">{state ? ago(state.checkedAt, now) : "—"}</span></span>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-gold disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                Re-scan
              </button>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="font-display text-5xl font-bold text-gradient-gold">{ph}%</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">protocol_health</div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Audited 24h</span>
              <span className="font-mono text-gold">{state?.stats.audited24h ?? "—"}</span>
              <span className="text-muted-foreground">Rejected</span>
              <span className="font-mono text-rose-400">{state?.stats.rejected24h ?? "—"}</span>
              <span className="text-muted-foreground">Quarantined</span>
              <span className="font-mono text-amber-400">{state?.stats.quarantined24h ?? "—"}</span>
              <span className="text-muted-foreground">Healed</span>
              <span className="font-mono text-emerald-400">{state?.stats.healedActions24h ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Sandbox Proving Ground */}
        <div className="glass rounded-2xl p-5 shadow-elegant">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5 text-gold" />
            Sandbox Proving Ground
          </div>
          <div className="space-y-3">
            {state?.queue.map((c) => {
              const v = VERDICT_STYLE[c.verdict];
              return (
                <div key={c.id} className="rounded-lg border border-border/40 bg-background/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display text-sm">{c.name}</div>
                      <div className="truncate text-[10px] font-mono text-muted-foreground">{c.source}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`inline-block h-2 w-2 rounded-full ${v.dot}`} />
                      <span className={`text-[10px] font-medium uppercase ${v.text}`}>{v.label}</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>{STAGE_LABEL[c.stage]}</span>
                      <span className="font-mono text-gold/80">{c.progress}%</span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-background/60">
                      <div
                        className="h-full bg-gradient-gold transition-all"
                        style={{ width: `${c.progress}%` }}
                      />
                    </div>
                  </div>
                  {c.findings.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {c.verdict === "trusted" ? (
                        <span className="flex items-center gap-1 text-emerald-400/90">
                          <CheckCircle2 className="h-3 w-3" /> {c.findings[0]}
                        </span>
                      ) : c.verdict === "rejected" ? (
                        <span className="flex items-center gap-1 text-rose-400/90">
                          <XCircle className="h-3 w-3" /> {c.findings[0]}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400/90">
                          <AlertTriangle className="h-3 w-3" /> {c.findings[0]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!state && <div className="text-xs text-muted-foreground">Booting audit pipeline…</div>}
          </div>
        </div>

        {/* Event Stream */}
        <div className="glass rounded-2xl p-5 shadow-elegant">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-gold" />
            Threat & Integrity Event Stream
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {state?.events.map((ev) => (
              <div key={ev.id} className="rounded-lg border border-border/40 bg-background/30 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${SEVERITY_STYLE[ev.severity]}`}>
                    {ev.kind} · {ev.severity}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{ago(ev.at, now)}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{ev.message}</div>
              </div>
            ))}
            {!state && <div className="text-xs text-muted-foreground">Awaiting first event…</div>}
          </div>
        </div>
      </div>

      {/* Master Ledger */}
      <div className="glass rounded-2xl p-5 shadow-elegant">
        <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5 text-gold" />
          Master Ledger · Integrated Tools
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {state?.ledger.map((l) => {
            const danger = l.trustScore < 60;
            return (
              <div
                key={l.id}
                className={`rounded-lg border p-3 text-xs ${
                  l.status === "isolated"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : l.status === "purged"
                    ? "border-rose-500/40 bg-rose-500/5"
                    : "border-border/40 bg-background/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display text-sm">{l.name}</div>
                  <Lock className={`h-3 w-3 ${l.status === "active" ? "text-emerald-400" : "text-amber-400"}`} />
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {l.category} · {l.status}
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">trust</span>
                  <span className={`font-mono ${danger ? "text-amber-400" : "text-gold"}`}>
                    {l.trustScore}%
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-background/60">
                  <div
                    className={`h-full transition-all ${danger ? "bg-amber-400" : "bg-gradient-gold"}`}
                    style={{ width: `${l.trustScore}%` }}
                  />
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground/80 line-clamp-2">{l.notes}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
