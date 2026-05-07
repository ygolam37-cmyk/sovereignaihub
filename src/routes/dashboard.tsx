import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { askSovereign } from "@/lib/ai.functions";
import { toast } from "sonner";
import { Shield, Send, LogOut, Sparkles } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

type Msg = { role: "user" | "assistant"; content: string; lane?: string };

function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const ask = useServerFn(askSovereign);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [messages]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    setBusy(true);
    try {
      const res = await ask({ data: { prompt } });
      if (res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: res.text || "(no response)", lane: res.lane }]);
      } else {
        toast.error(res.error);
      }
    } catch (e) {
      toast.error("Request failed.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
        <div className="glass mb-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 text-gold" />
          Identity firewall active — your name, email, and ID are stripped before any model is called.
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.length === 0 && (
            <div className="mx-auto max-w-xl pt-16 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-gold" />
              <h2 className="mt-4 font-display text-3xl">How can Sovereign help?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask anything. Reasoning, code, or creative — routed to the best open-source model behind the firewall.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-elegant ${
                  m.role === "user"
                    ? "bg-gradient-gold text-primary-foreground"
                    : "glass"
                }`}
              >
                {m.role === "assistant" && m.lane && (
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-gold/80">
                    Sovereign · {m.lane} lane
                  </div>
                )}
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="glass rounded-2xl px-4 py-3 text-sm text-muted-foreground">Thinking…</div>
            </div>
          )}
        </div>

        <div className="glass sticky bottom-4 rounded-2xl p-3 shadow-elegant">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Message Sovereign…"
              rows={2}
              className="resize-none border-0 bg-transparent focus-visible:ring-0"
            />
            <Button
              onClick={send}
              disabled={busy || !input.trim()}
              className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
