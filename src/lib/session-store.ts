// Durable client-side session store.
//
// Primary: IndexedDB (survives tab closes, browser restarts, and history clears
// far better than sessionStorage). Mirror: localStorage, so route guards can do a
// synchronous check before the first paint.
//
// Durability is requested via navigator.storage.persist(). If the browser denies
// it (common on mobile), we additionally write an AES-GCM encrypted backup record
// into a separate IndexedDB store, and surface a flag so the UI can ask the user
// to grant persistent storage gracefully.

export type LocalUser = { id: string; label: string };

const DB_NAME = "sovereign.session";
const DB_VERSION = 1;
const STORE_MAIN = "session";
const STORE_BACKUP = "session_backup";
const KEY_MAIN = "current";
export const MIRROR_KEY = "sovereign.localAuth.v1";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MAIN)) db.createObjectStore(STORE_MAIN);
      if (!db.objectStoreNames.contains(STORE_BACKUP)) db.createObjectStore(STORE_BACKUP);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = run(t.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

/* ---------------------------------------------------------------- persistence */

export type PersistState = "granted" | "denied" | "unsupported";

export async function persistedState(): Promise<PersistState> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) return "unsupported";
  try {
    return (await navigator.storage.persisted()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/** Ask the browser to make storage durable. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<PersistState> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return "unsupported";
  try {
    if (await navigator.storage.persisted()) return "granted";
    return (await navigator.storage.persist()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/* ------------------------------------------------------- encrypted backup key */

const KEY_ID = "backup-key";

async function backupKey(): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>(STORE_BACKUP, "readonly", (s) => s.get(KEY_ID));
  if (existing) return existing;
  // Non-extractable: the raw key material never leaves the browser's keystore.
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await tx(STORE_BACKUP, "readwrite", (s) => s.put(key, KEY_ID));
  return key;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function writeBackup(user: LocalUser) {
  const key = await backupKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(user)));
  await tx(STORE_BACKUP, "readwrite", (s) => s.put({ iv, ct }, KEY_MAIN));
}

async function readBackup(): Promise<LocalUser | null> {
  try {
    const rec = await tx<{ iv: Uint8Array; ct: ArrayBuffer } | undefined>(STORE_BACKUP, "readonly", (s) =>
      s.get(KEY_MAIN),
    );
    if (!rec) return null;
    const key = await backupKey();
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv }, key, rec.ct);
    return JSON.parse(dec.decode(pt)) as LocalUser;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- public API */

/** Synchronous best-effort check used by route guards before hydration. */
export function hasSessionMirror(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem(MIRROR_KEY);
  } catch {
    return false;
  }
}

export async function saveSession(user: LocalUser): Promise<PersistState> {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(user));
  } catch {
    /* private mode */
  }
  try {
    await tx(STORE_MAIN, "readwrite", (s) => s.put(user, KEY_MAIN));
  } catch {
    /* IDB unavailable */
  }
  const state = await requestPersistentStorage();
  // Durability was not granted — keep an encrypted fallback copy so the session
  // can still be recovered if the mirror is evicted.
  if (state !== "granted") {
    try {
      await writeBackup(user);
    } catch {
      /* ignore */
    }
  }
  return state;
}

/** Never expires: the record is only removed by an explicit manual logout. */
export async function loadSession(): Promise<LocalUser | null> {
  let user: LocalUser | null = null;
  try {
    user = (await tx<LocalUser | undefined>(STORE_MAIN, "readonly", (s) => s.get(KEY_MAIN))) ?? null;
  } catch {
    /* ignore */
  }
  if (!user) user = await readBackup();
  if (!user) {
    try {
      const raw = localStorage.getItem(MIRROR_KEY);
      if (raw) user = JSON.parse(raw) as LocalUser;
    } catch {
      /* ignore */
    }
  }
  if (user) {
    // Re-seed whichever layer was missing.
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
    try {
      await tx(STORE_MAIN, "readwrite", (s) => s.put(user as LocalUser, KEY_MAIN));
    } catch {
      /* ignore */
    }
  }
  return user;
}

export async function clearSession(): Promise<void> {
  try {
    localStorage.removeItem(MIRROR_KEY);
  } catch {
    /* ignore */
  }
  try {
    await tx(STORE_MAIN, "readwrite", (s) => s.delete(KEY_MAIN));
  } catch {
    /* ignore */
  }
  try {
    await tx(STORE_BACKUP, "readwrite", (s) => s.delete(KEY_MAIN));
  } catch {
    /* ignore */
  }
}
