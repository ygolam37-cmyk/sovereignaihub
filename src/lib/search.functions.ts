import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { searchDuckDuckGo } from "./search.server";
import { requireGate } from "./gate-middleware";

const InputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(10).optional(),
});

export const webSearch = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const hits = await searchDuckDuckGo(data.query, data.limit ?? 5);
    return { ok: true as const, hits };
  });

export const networkStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { healthSnapshot } = await import("./node-routing.server");
  const health = healthSnapshot();
  const engineUp = health.find((n) => n.id === "native-engine")?.up ?? true;

  let ddg = false;
  try {
    const hits = await searchDuckDuckGo("lovable", 1, 3000);
    ddg = hits.length > 0;
  } catch {
    ddg = false;
  }

  // Live mesh: peer nodes heartbeating in the last 90s + shard coverage.
  let peers = 0;
  let coverage = 0;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 90_000).toISOString();
    const { data: live } = await supabaseAdmin
      .from("peer_nodes")
      .select("node_key")
      .gt("last_heartbeat", cutoff);
    peers = live?.length ?? 0;
    const liveKeys = new Set((live ?? []).map((p) => p.node_key));
    const { data: shards } = await supabaseAdmin.from("model_shards").select("id");
    const { data: replicas } = await supabaseAdmin.from("shard_replicas").select("shard_id,node_key");
    const held = new Set(
      (replicas ?? []).filter((r) => liveKeys.has(r.node_key)).map((r) => r.shard_id),
    );
    coverage = shards?.length ? Math.round((held.size / shards.length) * 100) : 0;
  } catch {
    peers = 0;
  }

  const nodes = [
    { id: "engine", label: "Native engine", up: engineUp },
    { id: "web", label: "Open web", up: ddg },
    { id: "mesh", label: `Mesh (${peers})`, up: peers > 0 },
    { id: "shards", label: `Shards ${coverage}%`, up: coverage > 0 },
  ];
  const strength = Math.round((nodes.filter((n) => n.up).length / nodes.length) * 100);
  return { ok: true as const, nodes, strength, peers, coverage };
});
