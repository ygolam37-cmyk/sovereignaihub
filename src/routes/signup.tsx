import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { GoogleButton } from "@/components/GoogleButton";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: Signup,
});

function Signup() {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(email, password);
    setLoading(false);
    if (error) toast.error(error);
    else {
      toast.success("Account created. Check your inbox to verify, then sign in.");
      navigate({ to: "/login" });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="glass rounded-2xl p-8 shadow-elegant">
          <h1 className="font-display text-3xl">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your credentials are stored only in our private database.</p>
          <div className="mt-6">
            <GoogleButton label="Sign up with Google" />
            <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border/60" /> or <span className="h-px flex-1 bg-border/60" />
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90">
              {loading ? "Creating…" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have one? <Link to="/login" className="text-gold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
