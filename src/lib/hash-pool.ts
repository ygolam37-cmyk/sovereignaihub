// Small worker pool for SHA-256 verification. Keeps the main thread at 60fps
// even while hundreds of shards are being hashed. Falls back to inline crypto
// when Workers are unavailable (older mobile browsers, restricted contexts).

import { sha256Hex as inlineSha256Hex } from "./shard";

type Job = { resolve: (hex: string) => void; reject: (e: unknown) => void };

let workers: Worker[] = [];
let rr = 0;
let disabled = false;
const jobs = new Map<string, Job>();

function poolSize(): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  // Never take more than half the cores: the device must stay responsive.
  return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}

function spawn(): Worker | null {
  try {
    const w = new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<{ id: string; hex?: string; error?: string }>) => {
      const job = jobs.get(ev.data.id);
      if (!job) return;
      jobs.delete(ev.data.id);
      if (ev.data.hex) job.resolve(ev.data.hex);
      else job.reject(new Error(ev.data.error ?? "hash failed"));
    };
    w.onerror = () => {
      // A dead worker must never strand callers.
      disabled = true;
      terminatePool();
    };
    return w;
  } catch {
    disabled = true;
    return null;
  }
}

function ensurePool(): Worker | null {
  if (disabled || typeof Worker === "undefined") return null;
  if (!workers.length) {
    for (let i = 0; i < poolSize(); i++) {
      const w = spawn();
      if (w) workers.push(w);
    }
  }
  if (!workers.length) return null;
  const w = workers[rr % workers.length];
  rr = (rr + 1) % workers.length;
  return w;
}

export function terminatePool(): void {
  for (const w of workers) {
    try {
      w.terminate();
    } catch {
      /* ignore */
    }
  }
  workers = [];
  for (const [id, job] of jobs) {
    jobs.delete(id);
    job.reject(new Error("hash pool terminated"));
  }
}

/** Hash off the UI thread. Transfers the buffer copy, never the caller's bytes. */
export async function hashOffThread(bytes: ArrayBuffer): Promise<string> {
  const w = ensurePool();
  if (!w) return inlineSha256Hex(bytes);
  const copy = bytes.slice(0);
  const id = crypto.randomUUID();
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (jobs.delete(id)) inlineSha256Hex(bytes).then(resolve, reject);
    }, 15_000);
    jobs.set(id, {
      resolve: (hex) => {
        clearTimeout(timer);
        resolve(hex);
      },
      reject: (e) => {
        clearTimeout(timer);
        // Degrade instead of failing the download pipeline.
        inlineSha256Hex(bytes).then(resolve, () => reject(e));
      },
    });
    try {
      w.postMessage({ id, bytes: copy }, [copy]);
    } catch (e) {
      jobs.delete(id);
      clearTimeout(timer);
      inlineSha256Hex(bytes).then(resolve, () => reject(e));
    }
  });
}
