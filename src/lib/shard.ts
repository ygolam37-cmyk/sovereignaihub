/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
// Native sharding primitives — isomorphic, zero external dependencies.
// A model/binary is split into fixed-size shards; every shard is content
// addressed by SHA-256, and the model itself by a Merkle-style root hash.

export const DEFAULT_SHARD_SIZE = 256 * 1024; // 256 KiB
export const MAX_MODEL_BYTES = 256 * 1024 * 1024; // 256 MiB hard cap
export const MAX_SHARDS = 4096;

export type ShardMeta = { idx: number; size: number; sha256: string };

export type ShardPlan = {
  shardSize: number;
  sizeBytes: number;
  shards: ShardMeta[];
  merkleRoot: string;
};

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return toHex(digest);
}

/** Root hash over the ordered list of shard hashes (binary Merkle tree). */
export async function merkleRoot(shardHashes: string[]): Promise<string> {
  if (shardHashes.length === 0) return await sha256Hex(new Uint8Array(0));
  let level = shardHashes.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(await sha256Hex(new TextEncoder().encode(`${left}${right}`)));
    }
    level = next;
  }
  return level[0];
}

/** Split a Blob/File into content-addressed shards (browser side). */
export async function planShards(
  file: Blob,
  shardSize = DEFAULT_SHARD_SIZE,
  onProgress?: (done: number, total: number) => void,
): Promise<ShardPlan> {
  if (file.size > MAX_MODEL_BYTES) {
    throw new Error(`File too large — limit is ${Math.round(MAX_MODEL_BYTES / 1024 / 1024)} MB.`);
  }
  const total = Math.max(1, Math.ceil(file.size / shardSize));
  if (total > MAX_SHARDS) throw new Error("Too many shards — increase shard size.");

  const shards: ShardMeta[] = [];
  for (let i = 0; i < total; i++) {
    const slice = file.slice(i * shardSize, Math.min((i + 1) * shardSize, file.size));
    const buf = await slice.arrayBuffer();
    shards.push({ idx: i, size: buf.byteLength, sha256: await sha256Hex(buf) });
    onProgress?.(i + 1, total);
  }
  return {
    shardSize,
    sizeBytes: file.size,
    shards,
    merkleRoot: await merkleRoot(shards.map((s) => s.sha256)),
  };
}

export function sliceShard(file: Blob, idx: number, shardSize: number): Blob {
  return file.slice(idx * shardSize, Math.min((idx + 1) * shardSize, file.size));
}
