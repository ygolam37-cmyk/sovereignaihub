import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askSovereignUpstream } from "./ai.server";
import { searchDuckDuckGo, type SearchHit } from "./search.server";

const InputSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
});

const LIVE_INTENT =
  /\b(today|tonight|tomorrow|yesterday|now|current|latest|news|breaking|live|update|price|stock|score|weather|2024|2025|2026|2027|who is|what is|when did|when will|where is)\b/i;

function shouldSearch(prompt: string): boolean {
  return LIVE_INTENT.test(prompt) || prompt.trim().endsWith("?");
}

function formatContext(hits: SearchHit[]): string {
  if (!hits.length) return "";
  const lines = hits.map((h, i) => {
    const when = h.publishedAt ? ` (published ${h.publishedAt})` : "";
    const src = h.source ? ` [${h.source}]` : "";
    return `[${i + 1}] ${h.title}${when}${src}\n${h.snippet}\nSource: ${h.url}`;
  });
  return `Real-time open-source web context (multi-engine, system time ${new Date().toISOString()}):\n${lines.join("\n\n")}\n\nPrioritize the most recent items. Cite sources as [1], [2], etc.`;
}

export const askSovereign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const HF_TOKEN = process.env.HF_TOKEN;
    if (!HF_TOKEN) {
      return { ok: false as const, error: "Privacy backend not configured." };
    }

    let hits: SearchHit[] = [];
    if (shouldSearch(data.prompt)) {
      hits = await searchDuckDuckGo(data.prompt, 5).catch(() => []);
    }

    const augmented = hits.length
      ? `${formatContext(hits)}\n\nUser question: ${data.prompt}`
      : data.prompt;

    try {
      const res = await askSovereignUpstream({ token: HF_TOKEN, prompt: augmented });
      if (res.ok) {
        return { ...res, sources: hits };
      }
      return res;
    } catch (e) {
      console.error("askSovereign failed", e);
      return { ok: false as const, error: "Network error reaching privacy backend." };
    }
  });
