import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

type LocalUser = { id: string; label: string };

type AuthCtx = {
  user: LocalUser | null;
  loading: boolean;
  signInWithCode: (generated: string, entered: string) => { ok: true } | { ok: false; error: string };
  signOut: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);
const STORAGE_KEY = "sovereign.localAuth.v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as LocalUser);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  const signInWithCode = useCallback((generated: string, entered: string) => {
    // Strict, constant-length, character-by-character match. No trimming, no case fold.
    if (!generated || generated.length !== entered.length) {
      return { ok: false as const, error: "Access denied — code mismatch." };
    }
    let diff = 0;
    for (let i = 0; i < generated.length; i++) {
      diff |= generated.charCodeAt(i) ^ entered.charCodeAt(i);
    }
    if (diff !== 0) {
      return { ok: false as const, error: "Access denied — code mismatch." };
    }
    const u: LocalUser = {
      id: crypto.randomUUID(),
      label: `Sovereign session · ${generated.slice(0, 4)}…`,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
    return { ok: true as const };
  }, []);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signInWithCode, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
