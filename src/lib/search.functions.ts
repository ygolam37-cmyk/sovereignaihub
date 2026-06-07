import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchDuckDuckGo } from "./search.server";

const InputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(10).optional(),
});

export const webSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const hits = await searchDuckDuckGo(data.query, data.limit ?? 5);
    return { ok: true as const, hits };
  });

export const networkStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Honest indicator: which providers are actually wired.
    const hf = !!process.env.HF_TOKEN;
    // DDG has no key — probe with a tiny query to confirm reachability.
    let ddg = false;
    try {
      const hits = await searchDuckDuckGo("lovable", 1, 3000);
      ddg = hits.length > 0;
    } catch {
      ddg = false;
    }
    const lovableAi = !!process.env.LOVABLE_API_KEY;
    const nodes = [
      { id: "lovable", label: "Lovable AI", up: lovableAi },
      { id: "hf", label: "Hugging Face", up: hf },
      { id: "ddg", label: "DuckDuckGo", up: ddg },
    ];
    const strength = Math.round(
      (nodes.filter((n) => n.up).length / nodes.length) * 100,
    );
    return { ok: true as const, nodes, strength };
  });
