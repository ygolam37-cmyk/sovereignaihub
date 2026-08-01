import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { CODE_LEN, generateCode } from "@/lib/access-code";
import { toast } from "sonner";
import { LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Symmetric exit gate: the only way off the P2P network is a fresh
 * client-generated code, re-typed exactly — same algorithm as login.
 */
export function ExitGate() {
  const { signOutWithCode } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [entered, setEntered] = useState("");

  const regenerate = useCallback(() => {
    setCode(generateCode());
    setEntered("");
  }, []);

  useEffect(() => {
    if (open) regenerate();
  }, [open, regenerate]);

  const matched = entered.length === code.length && entered === code;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = signOutWithCode(code, entered);
    if (!res.ok) {
      toast.error(res.error);
      regenerate();
      return;
    }
    setOpen(false);
    navigate({ to: "/login", replace: true });
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <LogOut className="mr-2 h-4 w-4" /> Exit network
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur">
          <div className="glass w-full max-w-md rounded-2xl p-6 shadow-elegant">
            <div className="flex items-center gap-2 text-xs text-gold">
              <ShieldAlert className="h-4 w-4" />
              Symmetric exit verification
            </div>
            <h2 className="mt-2 font-display text-2xl">Leave the P2P network</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You remain a mandatory node until this code is retyped exactly. Nothing is sent to any server.
            </p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label>Box 1 — Generated exit code</Label>
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
                    aria-label="Regenerate exit code"
                    className="border-gold/40"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="exit-code">Box 2 — Retype the code</Label>
                <Input
                  id="exit-code"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={CODE_LEN}
                  value={entered}
                  onChange={(e) => setEntered(e.target.value)}
                  className="font-mono text-lg tracking-[0.25em]"
                />
                <p className={`text-xs ${matched ? "text-emerald-400" : "text-muted-foreground"}`}>
                  {matched ? "Exact match — exit permitted." : `Character-by-character match required (${entered.length}/${CODE_LEN}).`}
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  Stay connected
                </Button>
                <Button
                  type="submit"
                  disabled={!matched}
                  className="flex-1 bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
                >
                  Confirm exit
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
