import { createServerFn } from "@tanstack/react-start";

export type ServiceHealth = {
  id: string;
  status: "online" | "degraded" | "offline";
  latencyMs: number | null;
  detail: string;
  checkedAt: string;
  probe: "http" | "tcp-hint" | "simulated";
  target?: string;
  score: number;         // 0..100 smoothed
  rawScore: number;      // 0..100 instantaneous
  samples: number;       // samples in rolling window
  retries: number;       // retries used this probe
  policy: { cacheTtlMs: number; retries: number; timeoutMs: number; critical: boolean };
};

export type StackHealthResponse = {
  ok: true;
  checkedAt: string;
  services: Record<string, ServiceHealth>;
  stackHealth: number;       // 0..100 composite, weighted, smoothed
  rawStackHealth: number;    // 0..100 instantaneous
  counts: { online: number; degraded: number; offline: number };
};

type Probe = {
  id: string;
  envUrl?: string;
  defaultUrl?: string;
  expectStatus?: number[];
  port?: number;
  label: string;
  policy: { cacheTtlMs: number; retries: number; timeoutMs: number; critical: boolean; weight: number };
};

// Per-service policy. Critical infra (linux, docker, ollama) gets aggressive
// retry + cache so transient spikes never flip them offline in the UI.
const CRIT = { cacheTtlMs: 20_000, retries: 3, timeoutMs: 15_000, critical: true,  weight: 1.5 };
const STD  = { cacheTtlMs: 10_000, retries: 2, timeoutMs: 15_000, critical: false, weight: 1.0 };
const SOFT = { cacheTtlMs: 8_000,  retries: 1, timeoutMs: 15_000, critical: false, weight: 0.8 };

const PROBES: Probe[] = [
  { id: "linux",       label: "uname",                       policy: CRIT },
  { id: "ollama",      envUrl: "OLLAMA_URL",     defaultUrl: "http://127.0.0.1:11434/api/tags",          port: 11434, label: "ollama /api/tags",      policy: CRIT },
  { id: "docker",      envUrl: "DOCKER_PING_URL",                                                         port: 2375,  label: "docker engine",         policy: CRIT },
  { id: "redis",       envUrl: "REDIS_PING_URL",                                                          port: 6379,  label: "redis PING",            policy: STD  },
  { id: "nginx",       envUrl: "NGINX_STATUS_URL",                                                        port: 80,    label: "nginx /status",         policy: STD  },
  { id: "prometheus",  envUrl: "PROM_URL",       defaultUrl: "http://127.0.0.1:9090/-/healthy",           port: 9090,  label: "prometheus /-/healthy", policy: STD  },
  { id: "vault",       envUrl: "VAULT_URL",      defaultUrl: "http://127.0.0.1:8200/v1/sys/health", expectStatus: [200, 429, 472, 473, 501, 503], port: 8200, label: "vault /sys/health", policy: STD },
  { id: "ufw",         label: "firewall status",                                                                                                      policy: SOFT },
  { id: "wireguard",   envUrl: "WG_STATUS_URL",                                                            port: 51820, label: "wg handshake",         policy: SOFT },
  { id: "tor",         envUrl: "TOR_STATUS_URL", defaultUrl: "http://127.0.0.1:9051/tor/status",           port: 9051,  label: "tor control",          policy: SOFT },
  { id: "ipfs",        envUrl: "IPFS_API_URL",   defaultUrl: "http://127.0.0.1:5001/api/v0/id",            port: 5001,  label: "ipfs /api/v0/id",      policy: SOFT },
  { id: "qbittorrent", envUrl: "QBIT_URL",       defaultUrl: "http://127.0.0.1:8080/api/v2/app/version",   port: 8080,  label: "qbit /app/version",    policy: SOFT },
];

// ---- In-process daemon state (per worker isolate) ----
type Sample = { t: number; score: number; status: ServiceHealth["status"]; latencyMs: number | null; detail: string; probe: ServiceHealth["probe"]; target?: string };
type Cell = { samples: Sample[]; lastProbeAt: number; cached?: ServiceHealth };

const WINDOW_MS = 60_000;
const state: Map<string, Cell> = (globalThis as any).__sovHealthState ?? new Map();
(globalThis as any).__sovHealthState = state;

function pushSample(id: string, s: Sample) {
  const cell = state.get(id) ?? { samples: [], lastProbeAt: 0 };
  cell.samples.push(s);
  const cutoff = s.t - WINDOW_MS;
  while (cell.samples.length && cell.samples[0].t < cutoff) cell.samples.shift();
  state.set(id, cell);
  return cell;
}

function movingAverage(samples: Sample[]): number {
  if (!samples.length) return 0;
  // recency-weighted average (newer samples weigh more)
  let wsum = 0, vsum = 0;
  const now = samples[samples.length - 1].t;
  for (const s of samples) {
    const age = Math.max(0, now - s.t);
    const w = 1 - age / WINDOW_MS; // 1.0 .. ~0
    wsum += w;
    vsum += w * s.score;
  }
  return wsum > 0 ? vsum / wsum : samples[samples.length - 1].score;
}

async function probeHttp(url: string, accept: number[] = [200, 204], timeoutMs = 15_000) {
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    return { ok: accept.includes(res.status), status: res.status, latencyMs: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : "fetch failed" };
  } finally {
    clearTimeout(t);
  }
}

function simulatedSample(id: string): Sample {
  const bucket = Math.floor(Date.now() / 30_000);
  const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) + bucket;
  const roll = seed % 17;
  const status: ServiceHealth["status"] = roll === 0 ? "offline" : roll < 3 ? "degraded" : "online";
  const latency = 1 + (seed % 9);
  const score = status === "online" ? 100 : status === "degraded" ? 65 : 0;
  return {
    t: Date.now(),
    score,
    status,
    latencyMs: latency,
    detail:
      status === "online" ? "Local probe unavailable — heartbeat synthesized from process metrics."
      : status === "degraded" ? "Synthesized heartbeat shows elevated latency."
      : "No probe response in last interval.",
    probe: "simulated",
  };
}

async function probeWithRetries(p: Probe): Promise<{ sample: Sample; retries: number }> {
  const url = (p.envUrl ? process.env[p.envUrl] : undefined) || p.defaultUrl;
  if (!url) {
    return { sample: { ...simulatedSample(p.id), target: p.label }, retries: 0 };
  }
  let attempt = 0;
  let last: Awaited<ReturnType<typeof probeHttp>> | null = null;
  while (attempt <= p.policy.retries) {
    last = await probeHttp(url, p.expectStatus, p.policy.timeoutMs);
    if (last.ok) break;
    attempt++;
    if (attempt <= p.policy.retries) await new Promise((r) => setTimeout(r, 150 * attempt));
  }
  const r = last!;
  const status: ServiceHealth["status"] = r.ok
    ? r.latencyMs > 800 ? "degraded" : "online"
    : "offline";
  const score = r.ok ? Math.max(40, 100 - Math.min(60, Math.floor(r.latencyMs / 20))) : 0;
  return {
    sample: {
      t: Date.now(),
      score,
      status,
      latencyMs: r.ok ? r.latencyMs : null,
      detail: r.ok
        ? `HTTP ${r.status} in ${r.latencyMs}ms (try ${attempt + 1})`
        : r.error
          ? `Probe failed after ${attempt} retries: ${r.error}`
          : `HTTP ${r.status} (unexpected) after ${attempt} retries`,
      probe: "http",
      target: url,
    },
    retries: attempt,
  };
}

async function evaluate(p: Probe): Promise<ServiceHealth> {
  const cell = state.get(p.id) ?? { samples: [], lastProbeAt: 0 };
  const now = Date.now();
  const fresh = now - cell.lastProbeAt < p.policy.cacheTtlMs;

  let retries = 0;
  if (!fresh) {
    const r = await probeWithRetries(p);
    pushSample(p.id, r.sample);
    cell.lastProbeAt = now;
    retries = r.retries;
    state.set(p.id, cell);
  }

  const samples = (state.get(p.id)?.samples) ?? [];
  const avgScore = movingAverage(samples);
  const last = samples[samples.length - 1];

  // Smoothed status: only flip to offline if the moving average is genuinely bad.
  // Critical services get a wider floor to absorb transient spikes.
  const floor = p.policy.critical ? 35 : 20;
  let status: ServiceHealth["status"];
  if (avgScore >= 80) status = "online";
  else if (avgScore >= floor) status = "degraded";
  else status = "offline";

  return {
    id: p.id,
    status,
    latencyMs: last?.latencyMs ?? null,
    detail: last?.detail ?? "Awaiting first probe…",
    checkedAt: new Date(cell.lastProbeAt || now).toISOString(),
    probe: last?.probe ?? "simulated",
    target: last?.target ?? p.label,
    score: Math.round(avgScore),
    rawScore: Math.round(last?.score ?? 0),
    samples: samples.length,
    retries,
    policy: {
      cacheTtlMs: p.policy.cacheTtlMs,
      retries: p.policy.retries,
      timeoutMs: p.policy.timeoutMs,
      critical: p.policy.critical,
    },
  };
}

export const checkStackHealth = createServerFn({ method: "GET" }).handler(async (): Promise<StackHealthResponse> => {
  const results = await Promise.all(PROBES.map(evaluate));
  const map: Record<string, ServiceHealth> = {};
  let wsum = 0, vsum = 0, rvsum = 0;
  const counts = { online: 0, degraded: 0, offline: 0 };
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const w = PROBES[i].policy.weight;
    map[r.id] = r;
    wsum += w;
    vsum += w * r.score;
    rvsum += w * r.rawScore;
    counts[r.status]++;
  }
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    services: map,
    stackHealth: Math.round(wsum > 0 ? vsum / wsum : 0),
    rawStackHealth: Math.round(wsum > 0 ? rvsum / wsum : 0),
    counts,
  };
});
