import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { useState } from "react";

export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/dashboard`,
    });
    if (result.error) {
      setLoading(false);
      toast.error(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    window.location.href = "/dashboard";
  };
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={loading}
      className="w-full border-gold/40 bg-card/40 hover:bg-card/60"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.4 0-.6-.1-1.1-.2-1.6H12z"/>
      </svg>
      {loading ? "Redirecting…" : label}
    </Button>
  );
}
