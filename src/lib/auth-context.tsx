import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { codesMatch } from "@/lib/access-code";

type LocalUser = { id: string; label: string };

type AuthCtx = {
  user: LocalUser | null;
  loading: boolean;
  signInWithCode: (generated: string, entered: string) => { ok: true } | { ok: false; error: string };
  /** Symmetric exit: leaving the P2P network requires the same code verification. */
  signOutWithCode: (generated: string, entered: string) => { ok: true } | { ok: false; error: string };
};

const Ctx = createContext<AuthCtx | null>(null);
const STORAGE_KEY = "sovereign.localAuth.v1";

export function hasLocalAuth(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as LocalUser);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  // Keep tabs in sync: an explicit exit in one tab signs out everywhere.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        setUser(e.newValue ? (JSON.parse(e.newValue) as LocalUser) : null);
      } catch {
        setUser(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signInWithCode = useCallback((generated: string, entered: string) => {
    if (!codesMatch(generated, entered)) {
      return { ok: false as const, error: "Access denied — code mismatch." };
    }
    const u: LocalUser = {
      id: crypto.randomUUID(),
      label: `Sovereign node · ${generated.slice(0, 4)}…`,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
    return { ok: true as const };
  }, []);

  const signOutWithCode = useCallback((generated: string, entered: string) => {
    if (!codesMatch(generated, entered)) {
      return { ok: false as const, error: "Exit denied — code mismatch. You remain on the P2P network." };
    }
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    return { ok: true as const };
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signInWithCode, signOutWithCode }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
