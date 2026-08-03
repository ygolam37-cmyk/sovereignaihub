// Native P2P mesh engine (client-side).
// Responsibilities:
//  1. measure this device continuously and publish its score
//  2. pull an adaptive shard plan sized to the device's strength
//  3. mandatorily download assigned shards in the background
//  4. verify every shard by SHA-256 before caching it in IndexedDB
//  5. serve held shards to other peers over the mesh channel
//  6. survive quota pressure and sudden peer disconnects

import { measureDevice, type DeviceCaps } from "./device-caps";
import { getShard, hasShard, putShard, listHeld, quotaInfo, cacheBudget } from "./chunk-store";
import { sha256Hex } from "./shard";
import { getShardPlan, reportReplicas } from "./p2p.functions";
import { registerPeer } from "./registry.functions";

const NODE_KEY_STORAGE = "sovereign.peerNodeKey.v1";
const HEARTBEAT_MS = 30_000;
const SYNC_MS = 45_000;
const MESH_CHANNEL = "sovereign-mesh-shards";

export type MeshState = {
  running: boolean;
  nodeKey: string;
  caps: DeviceCaps | null;
  assigned: number;
  held: number;
  heldBytes: number;
  downloading: string | null;
  fromPeers: number;
  fromSeed: number;
  failures: number;
  quotaBlocked: boolean;
  usage: number;
  quota: number;
  budget: number;
  lastSync: number | null;
  liveNodes: number;
  message: string;
};

const state: MeshState = {
  running: false,
  nodeKey: "",
  caps: null,
  assigned: 0,
  held: 0,
  heldBytes: 0,
  downloading: null,
  fromPeers: 0,
  fromSeed: 0,
  failures: 0,
  quotaBlocked: false,
  usage: 0,
  quota: 0,
  budget: 0,
  lastSync: null,
  liveNodes: 0,
  message: "idle",
};

type Listener = (s: MeshState) => void;
const listeners = new Set<Listener>();

function emit(patch: Partial<MeshState>) {
  Object.assign(state, patch);
  for (const l of listeners) l({ ...state });
}

export function subscribeMesh(l: Listener): () => void {
  listeners.add(l);
  l({ ...state });
  return () => listeners.delete(l);
}

export function meshSnapshot(): MeshState {
  return { ...state };
}

function nodeKey(): string {
  const existing = localStorage.getItem(NODE_KEY_STORAGE);
  if (existing) return existing;
  const key = crypto.randomUUID();
  localStorage.setItem(NODE_KEY_STORAGE, key);
  return key;
}

/* ------------------------------------------------------------------ */
/* Peer-to-peer shard exchange (same-origin mesh channel)              */
/* ------------------------------------------------------------------ */

type MeshMsg =
  | { t: "want"; sha: string; from: string; rid: string }
  | { t: "have"; sha: string; from: string; rid: string; bytes: ArrayBuffer };

let channel: BroadcastChannel | null = null;
const pending = new Map<string, (bytes: ArrayBuffer) => void>();

function openChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(MESH_CHANNEL);
  channel.onmessage = async (ev: MessageEvent<MeshMsg>) => {
    const msg = ev.data;
    if (!msg) return;
    if (msg.t === "want" && msg.from !== state.nodeKey) {
      const bytes = await getShard(msg.sha);
      if (bytes) {
        channel?.postMessage({ t: "have", sha: msg.sha, from: state.nodeKey, rid: msg.rid, bytes });
      }
      return;
    }
    if (msg.t === "have") {
      const resolve = pending.get(msg.rid);
      if (resolve) {
        pending.delete(msg.rid);
        resolve(msg.bytes);
      }
    }
  };
}

/** Ask the mesh for a shard first; falls back to the seed store on timeout. */
function fetchFromPeers(sha: string, timeoutMs = 1200): Promise<ArrayBuffer | null> {
  if (!channel) return Promise.resolve(null);
  const rid = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(rid);
      resolve(null);
    }, timeoutMs);
    pending.set(rid, (bytes) => {
      clearTimeout(timer);
      resolve(bytes);
    });
    channel?.postMessage({ t: "want", sha, from: state.nodeKey, rid });
  });
}

async function fetchFromSeed(url: string, attempts = 3): Promise<ArrayBuffer | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return await res.arrayBuffer();
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300 * 2 ** i));
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Sync loop                                                           */
/* ------------------------------------------------------------------ */

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

async function refreshStorage() {
  const [{ usage, quota }, budget, held] = await Promise.all([quotaInfo(), cacheBudget(), listHeld()]);
  emit({
    usage,
    quota,
    budget,
    held: held.length,
    heldBytes: held.reduce((n, r) => n + r.size, 0),
  });
}

async function heartbeat(caps: DeviceCaps) {
  try {
    await registerPeer({
      data: {
        nodeKey: state.nodeKey,
        webgpu: caps.webgpu,
        ua: navigator.userAgent.slice(0, 200),
        score: caps.score,
        tier: caps.tier,
        cores: caps.cores,
        memoryGb: caps.memoryGb ?? undefined,
        battery: caps.batteryLevel ?? undefined,
      },
    });
  } catch {
    /* offline — the next beat retries */
  }
}

async function syncOnce() {
  if (syncing) return;
  syncing = true;
  try {
    const caps = await measureDevice(true);
    emit({ caps, message: "measuring device" });
    await heartbeat(caps);

    const budget = await cacheBudget();
    const plan = await getShardPlan({
      data: {
        nodeKey: state.nodeKey,
        score: caps.score,
        tier: caps.tier,
        capacityBytes: budget,
      },
    });
    if (!plan.ok) {
      emit({ message: "mesh unreachable" });
      return;
    }
    emit({
      assigned: plan.assignments.length,
      liveNodes: plan.liveNodes ?? 0,
      message: plan.assignments.length ? "downloading shards" : "in sync",
    });

    const stored: string[] = [];
    for (const a of plan.assignments) {
      if (await hasShard(a.sha256)) {
        stored.push(a.shardId);
        continue;
      }
      emit({ downloading: `${a.modelName} #${a.idx}` });

      let bytes = await fetchFromPeers(a.sha256);
      let viaPeer = !!bytes;
      if (!bytes) bytes = await fetchFromSeed(a.url);
      if (!bytes) {
        emit({ failures: state.failures + 1 });
        continue;
      }

      // Integrity gate — a shard that does not hash to its address is dropped.
      const hex = await sha256Hex(bytes);
      if (hex !== a.sha256) {
        emit({ failures: state.failures + 1, message: `integrity mismatch on #${a.idx}` });
        continue;
      }

      const write = await putShard({
        sha256: a.sha256,
        modelId: a.modelId,
        idx: a.idx,
        bytes,
        size: bytes.byteLength,
      });
      if (!write.ok) {
        emit({ quotaBlocked: write.reason === "quota", message: "storage full — cached what fits" });
        break;
      }
      emit({
        quotaBlocked: false,
        fromPeers: viaPeer ? state.fromPeers + 1 : state.fromPeers,
        fromSeed: viaPeer ? state.fromSeed : state.fromSeed + 1,
      });
      stored.push(a.shardId);
    }

    if (stored.length) {
      try {
        await reportReplicas({ data: { nodeKey: state.nodeKey, shardIds: stored, verified: true } });
      } catch {
        /* best-effort */
      }
    }

    emit({ downloading: null, lastSync: Date.now(), message: "in sync" });
    await refreshStorage();
  } finally {
    syncing = false;
  }
}

export function isMeshRunning(): boolean {
  return state.running;
}

export async function startMesh(): Promise<void> {
  if (typeof window === "undefined" || state.running) return;
  emit({ running: true, nodeKey: nodeKey(), message: "joining mesh" });
  openChannel();

  try {
    await navigator.storage?.persist?.();
  } catch {
    /* permission denied — LRU eviction handles it */
  }

  await syncOnce();

  const beat = async () => heartbeat(await measureDevice());
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  syncTimer = setInterval(() => void syncOnce(), SYNC_MS);

  // Sudden disconnect handling: resync as soon as the tab comes back.
  window.addEventListener("online", () => void syncOnce());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncOnce();
  });
}

export function stopMesh(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (syncTimer) clearInterval(syncTimer);
  heartbeatTimer = null;
  syncTimer = null;
  channel?.close();
  channel = null;
  emit({ running: false, message: "stopped" });
}

export function forceSync(): void {
  void syncOnce();
}
