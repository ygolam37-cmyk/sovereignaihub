/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
// IndexedDB shard cache with graceful quota handling + LRU eviction.

const DB_NAME = "sovereign-mesh";
const DB_VERSION = 1;
const STORE = "shards";

type ShardRecord = {
  sha256: string;
  modelId: string;
  idx: number;
  bytes: ArrayBuffer;
  size: number;
  storedAt: number;
  lastUsed: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "sha256" });
        store.createIndex("lastUsed", "lastUsed");
        store.createIndex("modelId", "modelId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
      }),
  );
}

export async function quotaInfo(): Promise<{ usage: number; quota: number; persisted: boolean }> {
  let usage = 0;
  let quota = 0;
  try {
    const est = await navigator.storage?.estimate?.();
    usage = est?.usage ?? 0;
    quota = est?.quota ?? 0;
  } catch {
    /* ignore */
  }
  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    /* ignore */
  }
  return { usage, quota, persisted };
}

/** Bytes we are willing to use for shard caching: 40% of remaining quota, capped. */
export async function cacheBudget(): Promise<number> {
  const { usage, quota } = await quotaInfo();
  if (!quota) return 64 * 1024 * 1024;
  const free = Math.max(0, quota - usage);
  return Math.min(512 * 1024 * 1024, Math.max(8 * 1024 * 1024, Math.floor(free * 0.4)));
}

export async function hasShard(sha256: string): Promise<boolean> {
  try {
    const rec = await tx<ShardRecord | undefined>("readonly", (s) => s.get(sha256) as IDBRequest<ShardRecord | undefined>);
    return !!rec;
  } catch {
    return false;
  }
}

export async function getShard(sha256: string): Promise<ArrayBuffer | null> {
  try {
    const rec = await tx<ShardRecord | undefined>("readonly", (s) => s.get(sha256) as IDBRequest<ShardRecord | undefined>);
    if (!rec) return null;
    void tx("readwrite", (s) => s.put({ ...rec, lastUsed: Date.now() }));
    return rec.bytes;
  } catch {
    return null;
  }
}

export async function listHeld(): Promise<Array<Omit<ShardRecord, "bytes">>> {
  try {
    const all = await tx<ShardRecord[]>("readonly", (s) => s.getAll() as IDBRequest<ShardRecord[]>);
    return all.map(({ bytes: _bytes, ...rest }) => rest);
  } catch {
    return [];
  }
}

export async function heldBytes(): Promise<number> {
  const held = await listHeld();
  return held.reduce((n, r) => n + r.size, 0);
}

/** Evict least-recently-used shards until `need` bytes fit inside the budget. */
export async function evictFor(need: number): Promise<number> {
  const budget = await cacheBudget();
  let used = await heldBytes();
  if (used + need <= budget) return 0;

  const held = (await listHeld()).sort((a, b) => a.lastUsed - b.lastUsed);
  let freed = 0;
  for (const rec of held) {
    if (used + need - freed <= budget) break;
    try {
      await tx("readwrite", (s) => s.delete(rec.sha256));
      freed += rec.size;
    } catch {
      break;
    }
  }
  used -= freed;
  return freed;
}

export async function putShard(rec: Omit<ShardRecord, "storedAt" | "lastUsed">): Promise<
  { ok: true } | { ok: false; reason: "quota" | "error" }
> {
  const now = Date.now();
  const write = () =>
    tx("readwrite", (s) => s.put({ ...rec, storedAt: now, lastUsed: now } satisfies ShardRecord));
  try {
    await evictFor(rec.size);
    await write();
    return { ok: true };
  } catch (e) {
    const quotaHit =
      e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NotAllowedError");
    if (quotaHit) {
      // Aggressive second pass: free 4x the needed space, then retry once.
      try {
        await evictFor(rec.size * 4);
        await write();
        return { ok: true };
      } catch {
        return { ok: false, reason: "quota" };
      }
    }
    return { ok: false, reason: "error" };
  }
}

export async function dropModel(modelId: string): Promise<void> {
  const held = await listHeld();
  for (const rec of held.filter((r) => r.modelId === modelId)) {
    try {
      await tx("readwrite", (s) => s.delete(rec.sha256));
    } catch {
      /* ignore */
    }
  }
}
