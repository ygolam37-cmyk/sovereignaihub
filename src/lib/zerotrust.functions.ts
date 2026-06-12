import { createServerFn } from "@tanstack/react-start";

export type AuditStage = "static-scan" | "cve-check" | "sandbox-exec" | "verdict";
export type Verdict = "trusted" | "quarantined" | "rejected" | "pending";

export type Candidate = {
  id: string;
  name: string;
  source: string;
  stage: AuditStage;
  progress: number; // 0..100
  verdict: Verdict;
  findings: string[];
};

export type LedgerEntry = {
  id: string;
  name: string;
  category: string;
  trustScore: number;     // 0..100
  status: "active" | "isolated" | "purged";
  integratedAt: string;
  lastCheckedAt: string;
  notes: string;
};

export type ProtocolEvent = {
  id: string;
  at: string;
  kind: "scan" | "integrity" | "threat" | "heal" | "ledger";
  severity: "info" | "warn" | "critical";
  message: string;
};

export type ZeroTrustResponse = {
  ok: true;
  checkedAt: string;
  protocolHealth: number; // 0..100
  queue: Candidate[];
  ledger: LedgerEntry[];
  events: ProtocolEvent[];
  stats: {
    audited24h: number;
    rejected24h: number;
    quarantined24h: number;
    healedActions24h: number;
  };
};

// Deterministic-ish pseudo data driven by current minute so the dashboard
// "moves" but stays coherent across the 15s polling interval.
function seedRand(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const CANDIDATE_POOL = [
  { name: "llama.cpp", source: "github.com/ggerganov/llama.cpp", category: "AI Runtime" },
  { name: "vLLM", source: "github.com/vllm-project/vllm", category: "AI Runtime" },
  { name: "Caddy", source: "github.com/caddyserver/caddy", category: "Edge Proxy" },
  { name: "MinIO", source: "github.com/minio/minio", category: "Storage" },
  { name: "Loki", source: "github.com/grafana/loki", category: "Observability" },
  { name: "Trivy", source: "github.com/aquasecurity/trivy", category: "Security" },
  { name: "Falco", source: "github.com/falcosecurity/falco", category: "Security" },
  { name: "OpenSearch", source: "github.com/opensearch-project/OpenSearch", category: "Search" },
];

const LEDGER_SEED: Omit<LedgerEntry, "trustScore" | "lastCheckedAt">[] = [
  { id: "linux",      name: "Linux Kernel",  category: "Core",          status: "active",   integratedAt: "2024-11-02T08:00:00Z", notes: "Hardened kernel, signed boot chain." },
  { id: "ollama",     name: "Ollama",        category: "Intelligence",  status: "active",   integratedAt: "2025-01-14T08:00:00Z", notes: "Sandboxed local LLM runtime." },
  { id: "docker",     name: "Docker Engine", category: "Core",          status: "active",   integratedAt: "2024-12-01T08:00:00Z", notes: "Rootless containers, signed images." },
  { id: "vault",      name: "HashiCorp Vault", category: "Security",    status: "active",   integratedAt: "2025-02-09T08:00:00Z", notes: "Secret broker, AES-256." },
  { id: "wireguard",  name: "WireGuard",     category: "Network",       status: "active",   integratedAt: "2024-10-20T08:00:00Z", notes: "ChaCha20 tunnels, audited." },
  { id: "tor",        name: "Tor",           category: "Network",       status: "active",   integratedAt: "2024-09-15T08:00:00Z", notes: "Onion routing — passive observation only." },
  { id: "ipfs",       name: "IPFS",          category: "Data",          status: "active",   integratedAt: "2025-03-12T08:00:00Z", notes: "Content-addressed storage." },
  { id: "qbittorrent",name: "qBittorrent",   category: "Data",          status: "isolated", integratedAt: "2025-04-01T08:00:00Z", notes: "Trust dipped — held in quarantine VLAN." },
];

export const getZeroTrustState = createServerFn({ method: "GET" }).handler(async (): Promise<ZeroTrustResponse> => {
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const rand = seedRand(minute);

  // Build audit queue (3-4 candidates) cycling through pool
  const queueCount = 3 + Math.floor(rand() * 2);
  const queue: Candidate[] = [];
  for (let i = 0; i < queueCount; i++) {
    const pick = CANDIDATE_POOL[(minute + i) % CANDIDATE_POOL.length];
    const stageIdx = Math.min(3, Math.floor(rand() * 4));
    const stages: AuditStage[] = ["static-scan", "cve-check", "sandbox-exec", "verdict"];
    const r = rand();
    const verdict: Verdict =
      stageIdx < 3 ? "pending"
      : r > 0.85 ? "rejected"
      : r > 0.7  ? "quarantined"
      : "trusted";
    const findings: string[] = [];
    if (verdict === "rejected") findings.push("Unsigned binary dependency detected");
    if (verdict === "quarantined") findings.push("CVE-2025-XXXX (medium) in transitive dep");
    if (verdict === "trusted") findings.push("No high/critical CVEs · supply-chain attested");
    queue.push({
      id: `cand-${minute}-${i}`,
      name: pick.name,
      source: pick.source,
      stage: stages[stageIdx],
      progress: stageIdx === 3 ? 100 : 25 + stageIdx * 25 + Math.floor(rand() * 20),
      verdict,
      findings,
    });
  }

  // Ledger with rolling trust scores
  const ledger: LedgerEntry[] = LEDGER_SEED.map((e, idx) => {
    const base = e.status === "isolated" ? 55 : 90;
    const drift = Math.floor((rand() - 0.5) * 8);
    const trust = Math.max(0, Math.min(100, base + drift));
    return {
      ...e,
      trustScore: trust,
      lastCheckedAt: new Date(now - idx * 7_000).toISOString(),
    };
  });

  // Synthesize an event stream (last 6 events)
  const eventTemplates: Omit<ProtocolEvent, "id" | "at">[] = [
    { kind: "scan",      severity: "info",     message: "Continuous self-diagnostic pass complete (12/12 modules)." },
    { kind: "integrity", severity: "info",     message: "Algorithmic integrity hash verified — no drift." },
    { kind: "threat",    severity: "warn",     message: "Anomalous outbound DNS pattern observed · auto-throttled." },
    { kind: "heal",      severity: "info",     message: "Self-healing: rotated Vault unseal key shard." },
    { kind: "ledger",    severity: "warn",     message: "qBittorrent trust dropped to 55% — moved to isolated VLAN." },
    { kind: "scan",      severity: "info",     message: "Sandbox proving ground: 4 candidates audited." },
    { kind: "threat",    severity: "critical", message: "Blocked unsigned container pull from untrusted registry." },
    { kind: "integrity", severity: "info",     message: "Master Ledger checkpoint written (Merkle root updated)." },
  ];
  const events: ProtocolEvent[] = Array.from({ length: 6 }).map((_, i) => {
    const t = eventTemplates[(minute + i * 3) % eventTemplates.length];
    return { ...t, id: `ev-${minute}-${i}`, at: new Date(now - i * 47_000).toISOString() };
  });

  const protocolHealth = Math.round(
    ledger.filter((l) => l.status === "active").reduce((a, l) => a + l.trustScore, 0) /
      Math.max(1, ledger.filter((l) => l.status === "active").length)
  );

  return {
    ok: true,
    checkedAt: new Date(now).toISOString(),
    protocolHealth,
    queue,
    ledger,
    events,
    stats: {
      audited24h: 47 + (minute % 11),
      rejected24h: 3 + (minute % 3),
      quarantined24h: 2 + (minute % 2),
      healedActions24h: 9 + (minute % 5),
    },
  };
});
