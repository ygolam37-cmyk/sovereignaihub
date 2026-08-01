import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { CODE_LEN, generateCode } from "@/lib/access-code";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const { signInWithCode, user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState<string>("");
  const [entered, setEntered] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Generate on the client only — keeps SSR markup stable.
  useEffect(() => {
    setCode(generateCode());
  }, []);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const regenerate = useCallback(() => {
    setCode(generateCode());
    setEntered("");
  }, []);

  const matched = useMemo(
    () => code.length > 0 && entered.length === code.length && entered === code,
    [entered, code],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = signInWithCode(code, entered);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      // Ephemeral: rotate the challenge on any failed attempt.
      regenerate();
      return;
    }
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="glass rounded-2xl p-8 shadow-elegant">
          <div className="flex items-center gap-2 text-xs text-gold">
            <ShieldCheck className="h-4 w-4" />
            Local algorithmic authentication
          </div>
          <h1 className="mt-2 font-display text-3xl">Sovereign access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The algorithm generated a one-time code for this session. Type it exactly to enter.
            Nothing is sent to any server.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label>Box 1 — Generated code</Label>
              <div className="flex items-center gap-2">
                <div
                  aria-live="polite"
                  className="flex-1 select-all rounded-md border border-gold/40 bg-background/60 px-3 py-2 font-mono text-lg tracking-[0.25em] text-gold"
                >
                  {code || "…"}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={regenerate}
                  aria-label="Regenerate code"
                  className="border-gold/40"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entered">Box 2 — Retype the code</Label>
              <Input
                id="entered"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                maxLength={CODE_LEN}
                value={entered}
                onChange={(e) => setEntered(e.target.value)}
                className="font-mono text-lg tracking-[0.25em]"
              />
              <p
                className={`text-xs ${
                  entered.length === 0
                    ? "text-muted-foreground"
                    : matched
                      ? "text-emerald-400"
                      : "text-destructive"
                }`}
              >
                {entered.length === 0
                  ? "Character-by-character match required."
                  : matched
                    ? "Exact match — you may enter."
                    : `Mismatch (${entered.length}/${CODE_LEN}).`}
              </p>
            </div>

            <Button
              type="submit"
              disabled={submitting || !matched}
              className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
            >
              {submitting ? "Verifying…" : "Enter Sovereign"}
            </Button>
          </form>

          <p className="mt-6 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
            Ephemeral · Client-side only · No accounts
          </p>
        </div>
      </div>
    </div>
  );
}
