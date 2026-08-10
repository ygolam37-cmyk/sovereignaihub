/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { codesMatch } from "@/lib/access-code";
import {
  clearSession,
  hasSessionMirror,
  loadSession,
  MIRROR_KEY,
  persistedState,
  requestPersistentStorage,
  saveSession,
  type LocalUser,
  type PersistState,
} from "@/lib/session-store";

type AuthCtx = {
  user: LocalUser | null;
  loading: boolean;
  /** "denied" means the browser refused durable storage — prompt the user. */
  persist: PersistState;
  requestPersist: () => Promise<PersistState>;
  signInWithCode: (generated: string, entered: string) => { ok: true } | { ok: false; error: string };
  /** Manual logout only: requires the displayed code to be retyped exactly. */
  signOutWithCode: (generated: string, entered: string) => { ok: true } | { ok: false; error: string };
};

const Ctx = createContext<AuthCtx | null>(null);

/** Synchronous guard check (route beforeLoad). */
export function hasLocalAuth(): boolean {
  return hasSessionMirror();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [persist, setPersist] = useState<PersistState>("unsupported");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await loadSession();
      if (restored) void (await import("@/lib/gate-client")).ensureGate();
      if (!cancelled) {
        setUser(restored);
        setLoading(false);
      }
      const state = restored ? await requestPersistentStorage() : await persistedState();
      if (!cancelled) setPersist(state);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep tabs in sync: an explicit manual logout in one tab signs out everywhere.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MIRROR_KEY) return;
      try {
        setUser(e.newValue ? (JSON.parse(e.newValue) as LocalUser) : null);
      } catch {
        setUser(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const requestPersist = useCallback(async () => {
    const state = await requestPersistentStorage();
    setPersist(state);
    return state;
  }, []);

  const signInWithCode = useCallback((generated: string, entered: string) => {
    if (!codesMatch(generated, entered)) {
      return { ok: false as const, error: "Access denied — code mismatch." };
    }
    const u: LocalUser = {
      id: crypto.randomUUID(),
      label: `Sovereign node · ${generated.slice(0, 4)}…`,
    };
    setUser(u);
    void saveSession(u).then(setPersist);
    void import("@/lib/gate-client").then((m) => m.ensureGate());
    return { ok: true as const };
  }, []);

  const signOutWithCode = useCallback((generated: string, entered: string) => {
    if (!codesMatch(generated, entered)) {
      return { ok: false as const, error: "Logout denied — code mismatch. Your session stays active." };
    }
    setUser(null);
    void clearSession();
    return { ok: true as const };
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, persist, requestPersist, signInWithCode, signOutWithCode }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
