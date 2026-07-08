import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchHfManifest, verifyModelSha } from "./registry.server";

const LaneSchema = z.enum(["fast", "reasoning", "code", "creative"]);

export const listModels = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("model_registry")
      .select("id,hf_model_id,display_name,lane,status,manifest_sha,submitted_by,notes,last_verified_at,created_at")
      .neq("status", "rejected")
      .order("created_at", { ascending: false });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, models: data ?? [] };
  });

export const listPeerNodes = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 90_000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("peer_nodes")
      .select("node_key,capabilities,last_heartbeat")
      .gt("last_heartbeat", cutoff);
    if (error) return { ok: false as const, error: error.message, count: 0 };
    return { ok: true as const, count: data?.length ?? 0, nodes: data ?? [] };
  });

const SubmitInput = z.object({
  hfModelId: z.string().trim().min(3).max(200).regex(/^[\w\-.]+\/[\w\-.:]+$/, "Invalid HF model id"),
  displayName: z.string().trim().min(1).max(120),
  lane: LaneSchema,
  submittedBy: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const submitModel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data }) => {
    const manifest = await fetchHfManifest(data.hfModelId);
    // Auto-approve iff manifest verified. Otherwise leave as pending for retry.
    const status = manifest ? "approved" : "pending";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("model_registry")
      .upsert(
        {
          hf_model_id: data.hfModelId,
          display_name: data.displayName,
          lane: data.lane,
          status,
          manifest_sha: manifest?.sha ?? null,
          submitted_by: data.submittedBy ?? null,
          notes: data.notes ?? null,
          last_verified_at: manifest ? new Date().toISOString() : null,
        },
        { onConflict: "hf_model_id" },
      )
      .select()
      .single();

    if (error) return { ok: false as const, error: error.message };
    return {
      ok: true as const,
      model: row,
      manifestVerified: !!manifest,
      sha: manifest?.sha ?? null,
    };
  });

const VerifyInput = z.object({ hfModelId: z.string().min(1) });

export const verifyModel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VerifyInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("model_registry")
      .select("hf_model_id,manifest_sha")
      .eq("hf_model_id", data.hfModelId)
      .maybeSingle();

    const check = await verifyModelSha(data.hfModelId, row?.manifest_sha ?? null);
    if (!check.ok || check.drift) {
      await supabaseAdmin
        .from("model_registry")
        .update({
          status: check.drift ? "quarantined" : "pending",
          last_verified_at: new Date().toISOString(),
          notes: check.drift ? `SHA drift detected — quarantined at ${new Date().toISOString()}` : null,
        })
        .eq("hf_model_id", data.hfModelId);
      return { ok: false as const, drift: check.drift, currentSha: check.currentSha };
    }

    await supabaseAdmin
      .from("model_registry")
      .update({ manifest_sha: check.currentSha, last_verified_at: new Date().toISOString() })
      .eq("hf_model_id", data.hfModelId);
    return { ok: true as const, sha: check.currentSha };
  });

const PeerInput = z.object({
  nodeKey: z.string().trim().min(8).max(128),
  webgpu: z.boolean().optional(),
  ua: z.string().max(200).optional(),
});

export const registerPeer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PeerInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("peer_nodes")
      .upsert(
        {
          node_key: data.nodeKey,
          capabilities: { webgpu: !!data.webgpu, ua: data.ua ?? null },
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: "node_key" },
      );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
