import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Native P2P model distribution control plane.
// No third-party AI provider is involved anywhere in this file: it only
// coordinates shard placement between the user's own browser nodes.

const BUCKET = "model-shards";
const STALE_PEER_MS = 90_000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------------ */
/* Publish + upload                                                    */
/* ------------------------------------------------------------------ */

const PublishInput = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["weights", "algorithm", "binary"]),
  sizeBytes: z.number().int().min(1).max(256 * 1024 * 1024),
  shardSize: z.number().int().min(4096).max(4 * 1024 * 1024),
  merkleRoot: z.string().regex(/^[0-9a-f]{64}$/),
  submittedBy: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  shards: z
    .array(
      z.object({
        idx: z.number().int().min(0),
        size: z.number().int().min(1).max(4 * 1024 * 1024),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .min(1)
    .max(4096),
});

export const publishModel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PublishInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: model, error } = await db
      .from("native_models")
      .insert({
        name: data.name,
        kind: data.kind,
        size_bytes: data.sizeBytes,
        shard_size: data.shardSize,
        shard_count: data.shards.length,
        merkle_root: data.merkleRoot,
        status: "verifying",
        submitted_by: data.submittedBy ?? null,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error || !model) return { ok: false as const, error: error?.message ?? "Insert failed" };

    const rows = data.shards.map((s) => ({
      model_id: model.id,
      idx: s.idx,
      size_bytes: s.size,
      sha256: s.sha256,
      storage_path: `${model.id}/${s.idx}.bin`,
    }));
    const { error: shardErr } = await db.from("model_shards").insert(rows);
    if (shardErr) {
      await db.from("native_models").delete().eq("id", model.id);
      return { ok: false as const, error: shardErr.message };
    }

    // Signed upload tickets, so shard bytes never pass through this function.
    const tickets: Array<{ idx: number; path: string; token: string }> = [];
    for (const row of rows) {
      const { data: signed, error: sErr } = await db.storage
        .from(BUCKET)
        .createSignedUploadUrl(row.storage_path, { upsert: true });
      if (sErr || !signed) return { ok: false as const, error: sErr?.message ?? "Sign failed" };
      tickets.push({ idx: row.idx, path: row.storage_path, token: signed.token });
    }

    return { ok: true as const, modelId: model.id, bucket: BUCKET, tickets };
  });

/* ------------------------------------------------------------------ */
/* Automated integrity verification                                    */
/* ------------------------------------------------------------------ */

const IdInput = z.object({ modelId: z.string().uuid() });

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function merkleRoot(hashes: string[]): Promise<string> {
  if (!hashes.length) return sha256Hex(new Uint8Array(0));
  let level = hashes.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(await sha256Hex(new TextEncoder().encode(`${level[i]}${level[i + 1] ?? level[i]}`)));
    }
    level = next;
  }
  return level[0];
}

export const verifyModel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: model } = await db
      .from("native_models")
      .select("id,merkle_root,shard_count,size_bytes")
      .eq("id", data.modelId)
      .maybeSingle();
    if (!model) return { ok: false as const, error: "Model not found" };

    const { data: shards } = await db
      .from("model_shards")
      .select("idx,sha256,storage_path,size_bytes")
      .eq("model_id", data.modelId)
      .order("idx");
    if (!shards?.length) return { ok: false as const, error: "No shards registered" };

    // Full byte verification up to 64 MiB, deterministic sampling above that.
    const budget = 64 * 1024 * 1024;
    const full = (model.size_bytes ?? 0) <= budget;
    const step = full ? 1 : Math.ceil(shards.length / 48);
    const failed: number[] = [];
    let checked = 0;

    for (let i = 0; i < shards.length; i += step) {
      const s = shards[i];
      const { data: blob, error } = await db.storage.from(BUCKET).download(s.storage_path);
      if (error || !blob) {
        failed.push(s.idx);
        continue;
      }
      const hex = await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
      checked++;
      if (hex !== s.sha256) failed.push(s.idx);
    }

    const root = await merkleRoot(shards.map((s) => s.sha256));
    const rootOk = root === model.merkle_root;
    const now = new Date().toISOString();

    if (failed.length || !rootOk) {
      await db
        .from("native_models")
        .update({
          status: "quarantined",
          verified_at: now,
          notes: rootOk
            ? `Integrity failure on shard(s) ${failed.slice(0, 8).join(", ")}`
            : "Merkle root mismatch",
        })
        .eq("id", data.modelId);
      return { ok: false as const, error: rootOk ? "Shard integrity failure" : "Merkle root mismatch" };
    }

    await db
      .from("native_models")
      .update({
        status: "live",
        verified_at: now,
        notes: full
          ? `Verified ${checked}/${shards.length} shards + Merkle root`
          : `Sampled ${checked}/${shards.length} shards + full Merkle root`,
      })
      .eq("id", data.modelId);

    return { ok: true as const, checked, total: shards.length, merkleRoot: root, sampled: !full };
  });

/* ------------------------------------------------------------------ */
/* Listing                                                             */
/* ------------------------------------------------------------------ */

export const listNativeModels = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("native_models")
    .select("id,name,kind,size_bytes,shard_size,shard_count,merkle_root,status,submitted_by,notes,verified_at,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false as const, error: error.message, models: [] };
  return { ok: true as const, models: data ?? [] };
});

/* ------------------------------------------------------------------ */
/* Adaptive load balancing — shard plan per device                      */
/* ------------------------------------------------------------------ */

const PlanInput = z.object({
  nodeKey: z.string().trim().min(8).max(128),
  score: z.number().min(0).max(100),
  tier: z.enum(["heavy", "medium", "light"]),
  capacityBytes: z.number().int().min(0).max(2 * 1024 * 1024 * 1024),
});

export const getShardPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PlanInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const cutoff = new Date(Date.now() - STALE_PEER_MS).toISOString();

    // Fault tolerance: replicas from peers that stopped heartbeating are dead.
    const { data: livePeers } = await db
      .from("peer_nodes")
      .select("node_key,score")
      .gt("last_heartbeat", cutoff);
    const liveKeys = new Set((livePeers ?? []).map((p) => p.node_key));

    const { data: models } = await db
      .from("native_models")
      .select("id,name,shard_count")
      .in("status", ["live", "verifying"])
      .order("created_at", { ascending: false })
      .limit(10);
    if (!models?.length) return { ok: true as const, assignments: [], liveNodes: liveKeys.size };

    const modelIds = models.map((m) => m.id);
    const { data: shards } = await db
      .from("model_shards")
      .select("id,model_id,idx,sha256,size_bytes,storage_path")
      .in("model_id", modelIds)
      .order("idx");
    const { data: replicas } = await db
      .from("shard_replicas")
      .select("shard_id,node_key,verified")
      .in(
        "shard_id",
        (shards ?? []).map((s) => s.id),
      );

    const liveReplicaCount = new Map<string, number>();
    const mine = new Set<string>();
    for (const r of replicas ?? []) {
      if (r.node_key === data.nodeKey) mine.add(r.shard_id);
      if (!liveKeys.has(r.node_key)) continue;
      liveReplicaCount.set(r.shard_id, (liveReplicaCount.get(r.shard_id) ?? 0) + 1);
    }

    // Share of the corpus this device should shoulder, from its measured score.
    const share = Math.max(0.03, Math.min(1, data.score / 100));
    const all = shards ?? [];
    const targetCount = Math.max(1, Math.round(all.length * share));

    // Least-replicated shards first → self-healing re-replication after churn.
    const ranked = all
      .slice()
      .sort(
        (a, b) =>
          (liveReplicaCount.get(a.id) ?? 0) - (liveReplicaCount.get(b.id) ?? 0) || a.idx - b.idx,
      );

    const assignments: Array<{
      shardId: string;
      modelId: string;
      modelName: string;
      idx: number;
      sha256: string;
      size: number;
      url: string;
    }> = [];
    let bytes = 0;
    const nameById = new Map(models.map((m) => [m.id, m.name] as const));

    for (const s of ranked) {
      if (assignments.length >= targetCount) break;
      if (data.capacityBytes && bytes + s.size_bytes > data.capacityBytes) continue;
      const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(s.storage_path, 600);
      if (!signed?.signedUrl) continue;
      assignments.push({
        shardId: s.id,
        modelId: s.model_id,
        modelName: nameById.get(s.model_id) ?? "model",
        idx: s.idx,
        sha256: s.sha256,
        size: s.size_bytes,
        url: signed.signedUrl,
      });
      bytes += s.size_bytes;
    }

    return {
      ok: true as const,
      assignments,
      liveNodes: liveKeys.size,
      alreadyHeld: mine.size,
      tier: data.tier,
      targetCount,
    };
  });

/* ------------------------------------------------------------------ */
/* Replica reporting + mesh stats                                      */
/* ------------------------------------------------------------------ */

const ReportInput = z.object({
  nodeKey: z.string().trim().min(8).max(128),
  shardIds: z.array(z.string().uuid()).max(512),
  verified: z.boolean(),
});

export const reportReplicas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReportInput.parse(d))
  .handler(async ({ data }) => {
    if (!data.shardIds.length) return { ok: true as const, stored: 0 };
    const db = await admin();
    const now = new Date().toISOString();
    const { error } = await db.from("shard_replicas").upsert(
      data.shardIds.map((shard_id) => ({
        shard_id,
        node_key: data.nodeKey,
        verified: data.verified,
        updated_at: now,
      })),
      { onConflict: "shard_id,node_key" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, stored: data.shardIds.length };
  });

const DropInput = z.object({
  nodeKey: z.string().trim().min(8).max(128),
  shardIds: z.array(z.string().uuid()).max(512),
});

export const dropReplicas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DropInput.parse(d))
  .handler(async ({ data }) => {
    if (!data.shardIds.length) return { ok: true as const };
    const db = await admin();
    await db
      .from("shard_replicas")
      .delete()
      .eq("node_key", data.nodeKey)
      .in("shard_id", data.shardIds);
    return { ok: true as const };
  });

export const meshStats = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const cutoff = new Date(Date.now() - STALE_PEER_MS).toISOString();

  const { data: peers } = await db
    .from("peer_nodes")
    .select("node_key,score,tier,capabilities,last_heartbeat")
    .gt("last_heartbeat", cutoff)
    .order("score", { ascending: false })
    .limit(200);
  const live = peers ?? [];
  const liveKeys = new Set(live.map((p) => p.node_key));

  const { data: shards } = await db.from("model_shards").select("id");
  const { data: replicas } = await db.from("shard_replicas").select("shard_id,node_key");

  const counts = new Map<string, number>();
  for (const r of replicas ?? []) {
    if (!liveKeys.has(r.node_key)) continue;
    counts.set(r.shard_id, (counts.get(r.shard_id) ?? 0) + 1);
  }
  const total = shards?.length ?? 0;
  const replicated = Array.from(counts.values()).filter((n) => n > 0).length;
  const underReplicated = (shards ?? []).filter((s) => (counts.get(s.id) ?? 0) < 2).length;

  return {
    ok: true as const,
    liveNodes: live.length,
    tiers: {
      heavy: live.filter((p) => p.tier === "heavy").length,
      medium: live.filter((p) => p.tier === "medium").length,
      light: live.filter((p) => p.tier === "light").length,
    },
    totalShards: total,
    replicatedShards: replicated,
    underReplicated,
    coverage: total ? Math.round((replicated / total) * 100) : 0,
    peers: live.map((p) => ({
      nodeKey: `${p.node_key.slice(0, 8)}…`,
      score: Number(p.score ?? 0),
      tier: p.tier ?? "light",
      lastHeartbeat: p.last_heartbeat,
    })),
  };
});
