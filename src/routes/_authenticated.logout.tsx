import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { CODE_LEN, generateCode } from "@/lib/access-code";
import { toast } from "sonner";
import { RefreshCw, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/logout")({
  component: ManualLogout,
  head: () => ({
    meta: [
      { title: "Manual logout — Sovereign AI" },
      {
        name: "description",
        content:
          "Confirm a client-generated verification code to end your Sovereign AI session. Sessions never expire automatically.",
      },
      { property: "og:title", content: "Manual logout — Sovereign AI" },
      {
        property: "og:description",
        content: "Type the displayed verification code to manually end your Sovereign AI session.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ManualLogout() {
  const { signOutWithCode } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [entered, setEntered] = useState("");

  const regenerate = useCallback(() => {
    setCode(generateCode());
    setEntered("");
  }, []);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const matched = code.length > 0 && entered.length === code.length && entered === code;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = signOutWithCode(code, entered);
    if (!res.ok) {
      toast.error(res.error);
      regenerate();
      return;
    }
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="glass rounded-2xl p-8 shadow-elegant">
          <div className="flex items-center gap-2 text-xs text-gold">
            <ShieldAlert className="h-4 w-4" />
            Manual logout verification
          </div>
          <h1 className="mt-2 font-display text-3xl">End this session</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your session never expires on its own. Type the code below exactly to log out and erase the stored
            session from this device.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label>Box 1 — Verification code</Label>
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
                  aria-label="Regenerate verification code"
                  className="border-gold/40"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logout-code">Box 2 — Retype the code</Label>
              <Input
                id="logout-code"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                maxLength={CODE_LEN}
                value={entered}
                onChange={(e) => setEntered(e.target.value)}
                className="font-mono text-lg tracking-[0.25em]"
              />
              <p className={`text-xs ${matched ? "text-emerald-400" : "text-muted-foreground"}`}>
                {matched
                  ? "Exact match — logout permitted."
                  : `Character-by-character match required (${entered.length}/${CODE_LEN}).`}
              </p>
            </div>

            <div className="flex gap-2">
              <Link to="/dashboard" className="flex-1">
                <Button type="button" variant="outline" className="w-full">
                  Stay signed in
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={!matched}
                className="flex-1 bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
              >
                Confirm logout
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
