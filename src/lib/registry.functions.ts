/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireGate } from "./gate-middleware";

const PeerInput = z.object({
  nodeKey: z.string().trim().min(8).max(128),
  webgpu: z.boolean().optional(),
  ua: z.string().max(200).optional(),
  score: z.number().min(0).max(100).optional(),
  tier: z.enum(["heavy", "medium", "light"]).optional(),
  cores: z.number().int().min(1).max(256).optional(),
  memoryGb: z.number().min(0).max(1024).optional(),
  battery: z.number().min(0).max(1).optional(),
});

/** Heartbeat + capability publication for a browser peer node. */
export const registerPeer = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: unknown) => PeerInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("peer_nodes").upsert(
      {
        node_key: data.nodeKey,
        capabilities: {
          webgpu: !!data.webgpu,
          ua: data.ua ?? null,
          cores: data.cores ?? null,
          memoryGb: data.memoryGb ?? null,
          battery: data.battery ?? null,
        },
        score: data.score ?? 0,
        tier: data.tier ?? "light",
        last_heartbeat: new Date().toISOString(),
      },
      { onConflict: "node_key" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const listPeerNodes = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("peer_nodes")
    .select("node_key,capabilities,score,tier,last_heartbeat")
    .gt("last_heartbeat", cutoff);
  if (error) return { ok: false as const, error: error.message, count: 0, nodes: [] };
  return { ok: true as const, count: data?.length ?? 0, nodes: data ?? [] };
});
