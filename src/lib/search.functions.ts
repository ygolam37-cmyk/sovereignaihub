import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { searchDuckDuckGo } from "./search.server";

const InputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(10).optional(),
});

export const webSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const hits = await searchDuckDuckGo(data.query, data.limit ?? 5);
    return { ok: true as const, hits };
  });

export const networkStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const { healthSnapshot } = await import("./node-routing.server");
    const providerHealth = healthSnapshot();
    const hfRouter = providerHealth.find((n) => n.id === "hf-router")?.up ?? true;
    const hfDirect = providerHealth.find((n) => n.id === "hf-direct")?.up ?? true;
    const hf = !!process.env.HF_TOKEN && (hfRouter || hfDirect);

    let ddg = false;
    try {
      const hits = await searchDuckDuckGo("lovable", 1, 3000);
      ddg = hits.length > 0;
    } catch {
      ddg = false;
    }
    const lovableAi = !!process.env.LOVABLE_API_KEY;

    // Live peer-node count (opt-in browsers heartbeating in the last 90s).
    let peers = 0;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const cutoff = new Date(Date.now() - 90_000).toISOString();
      const { count } = await supabaseAdmin
        .from("peer_nodes")
        .select("node_key", { count: "exact", head: true })
        .gt("last_heartbeat", cutoff);
      peers = count ?? 0;
    } catch {
      peers = 0;
    }

    const nodes = [
      { id: "lovable", label: "Lovable AI", up: lovableAi },
      { id: "hf", label: "Hugging Face", up: hf },
      { id: "ddg", label: "DuckDuckGo", up: ddg },
      { id: "peers", label: `Peers (${peers})`, up: peers > 0 },
    ];
    const strength = Math.round(
      (nodes.filter((n) => n.up).length / nodes.length) * 100,
    );
    return { ok: true as const, nodes, strength, peers };
  });
