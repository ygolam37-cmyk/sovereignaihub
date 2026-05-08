import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Cpu, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [loading, user, navigate]);
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/signup">
            <Button className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90">
              Get access
            </Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <section className="text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-gold" />
            Privacy-first agentic intelligence
          </div>
          <h1 className="mt-6 font-display text-5xl leading-[1.05] sm:text-7xl">
            Your private <span className="text-gradient-gold">sovereign</span> AI.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            One unified brand. A wall of privacy between you and the open-source
            models doing the work. We strip your identity before a single token
            leaves our servers.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/signup">
              <Button size="lg" className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90">
                Create your account
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="border-gold/40">
                Sign in
              </Button>
            </Link>
          </div>
        </section>

        <section className="mt-24 grid gap-5 sm:grid-cols-3">
          {[
            {
              icon: Lock,
              title: "Identity firewall",
              body: "Email, name, and session ID never leave our backend. Only the clean prompt is routed.",
            },
            {
              icon: Cpu,
              title: "Agentic routing",
              body: "Each prompt is dispatched to the best open-source model — reasoning, code, or creative.",
            },
            {
              icon: Sparkles,
              title: "Unified experience",
              body: "You only ever talk to Sovereign. The multi-agent system stays invisible.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass rounded-2xl p-6 shadow-elegant">
              <Icon className="h-6 w-6 text-gold" />
              <h3 className="mt-4 text-lg">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
