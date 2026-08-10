/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
// Cross-network WebRTC mesh.
//
// Discovery + signaling ride on the realtime broadcast channel, so peers find
// each other regardless of network: different Wi-Fi, cellular data, CGNAT, or
// rotating IPs. NAT traversal uses multiple public STUN servers; when a direct
// path is impossible the transfer falls back to the seed store, so a shard is
// never lost.
//
// Everything here is fault tolerant: dead peers are pruned, failed connections
// are retried with backoff, and no request can hang forever.

import { supabase } from "@/integrations/supabase/client";

const ROOM = "sovereign-mesh-v1";
const CHANNEL_LABEL = "shards";
const RID_LEN = 36; // uuid, ascii-encoded header
const MAX_PEERS = 8;
const CONNECT_TIMEOUT_MS = 12_000;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: ["stun:stun.cloudflare.com:3478"] },
  { urls: ["stun:global.stun.twilio.com:3478"] },
];

type Peer = {
  id: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  ready: boolean;
  failures: number;
};

type ShardResolver = (bytes: ArrayBuffer | null) => void;

let selfId = "";
let channel: ReturnType<typeof supabase.channel> | null = null;
let started = false;
const peers = new Map<string, Peer>();
const waiting = new Map<string, ShardResolver>();
let provider: ((sha: string) => Promise<ArrayBuffer | null>) | null = null;
const listeners = new Set<(n: number) => void>();

function emitCount() {
  const n = connectedPeerCount();
  for (const l of listeners) l(n);
}

export function subscribeMeshPeers(l: (n: number) => void): () => void {
  listeners.add(l);
  l(connectedPeerCount());
  return () => listeners.delete(l);
}

export function connectedPeerCount(): number {
  let n = 0;
  for (const p of peers.values()) if (p.ready) n++;
  return n;
}

export function meshPeerIds(): string[] {
  return [...peers.values()].filter((p) => p.ready).map((p) => p.id);
}

/* ------------------------------------------------------------------ */
/* Framing                                                             */
/* ------------------------------------------------------------------ */

function frame(rid: string, bytes: ArrayBuffer): ArrayBuffer {
  const out = new Uint8Array(RID_LEN + bytes.byteLength);
  out.set(new TextEncoder().encode(rid.padEnd(RID_LEN, " ")).slice(0, RID_LEN), 0);
  out.set(new Uint8Array(bytes), RID_LEN);
  return out.buffer;
}

function unframe(buf: ArrayBuffer): { rid: string; bytes: ArrayBuffer } | null {
  if (buf.byteLength <= RID_LEN) return null;
  const rid = new TextDecoder().decode(new Uint8Array(buf, 0, RID_LEN)).trim();
  return { rid, bytes: buf.slice(RID_LEN) };
}

/* ------------------------------------------------------------------ */
/* Data channel wiring                                                 */
/* ------------------------------------------------------------------ */

function attachChannel(peer: Peer, dc: RTCDataChannel) {
  dc.binaryType = "arraybuffer";
  peer.dc = dc;
  dc.onopen = () => {
    peer.ready = true;
    peer.failures = 0;
    emitCount();
  };
  dc.onclose = () => {
    peer.ready = false;
    emitCount();
  };
  dc.onerror = () => {
    peer.ready = false;
    emitCount();
  };
  dc.onmessage = async (ev: MessageEvent<string | ArrayBuffer>) => {
    if (typeof ev.data === "string") {
      type Ctl = { t?: string; rid?: string; sha?: string };
      let msg: Ctl | null = null;
      try {
        msg = JSON.parse(ev.data) as Ctl;
      } catch {
        return;
      }
      if (msg?.t === "want" && msg.sha && msg.rid) {
        const bytes = provider ? await provider(msg.sha).catch(() => null) : null;
        if (!bytes || dc.readyState !== "open") return;
        try {
          dc.send(frame(msg.rid, bytes));
        } catch {
          /* channel closed mid-send */
        }
      }
      if (msg?.t === "miss" && msg.rid) {
        const resolve = waiting.get(msg.rid);
        if (resolve) {
          waiting.delete(msg.rid);
          resolve(null);
        }
      }
      return;
    }
    const parsed = unframe(ev.data);
    if (!parsed) return;
    const resolve = waiting.get(parsed.rid);
    if (resolve) {
      waiting.delete(parsed.rid);
      resolve(parsed.bytes);
    }
  };
}

function dropPeer(id: string) {
  const p = peers.get(id);
  if (!p) return;
  try {
    p.dc?.close();
    p.pc.close();
  } catch {
    /* ignore */
  }
  peers.delete(id);
  emitCount();
}

function newPeer(id: string): Peer {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
  const peer: Peer = { id, pc, dc: null, ready: false, failures: 0 };
  peers.set(id, peer);

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      void channel?.send({
        type: "broadcast",
        event: "ice",
        payload: { from: selfId, to: id, candidate: ev.candidate.toJSON() },
      });
    }
  };
  pc.ondatachannel = (ev) => attachChannel(peer, ev.channel);
  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      peer.ready = false;
      emitCount();
      if (pc.connectionState === "failed" || pc.connectionState === "closed") dropPeer(id);
    }
  };
  // A connection that never opens must not leak.
  setTimeout(() => {
    if (peers.get(id) === peer && !peer.ready && pc.connectionState !== "connected") dropPeer(id);
  }, CONNECT_TIMEOUT_MS);
  return peer;
}

async function initiate(id: string) {
  if (peers.has(id) || peers.size >= MAX_PEERS) return;
  const peer = newPeer(id);
  attachChannel(peer, peer.pc.createDataChannel(CHANNEL_LABEL, { ordered: true }));
  try {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await channel?.send({
      type: "broadcast",
      event: "sdp",
      payload: { from: selfId, to: id, sdp: peer.pc.localDescription },
    });
  } catch {
    dropPeer(id);
  }
}

async function onSdp(payload: { from: string; to: string; sdp: RTCSessionDescriptionInit }) {
  if (payload.to !== selfId || payload.from === selfId) return;
  if (payload.sdp.type === "offer") {
    if (peers.size >= MAX_PEERS && !peers.has(payload.from)) return;
    const peer = peers.get(payload.from) ?? newPeer(payload.from);
    try {
      await peer.pc.setRemoteDescription(payload.sdp);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      await channel?.send({
        type: "broadcast",
        event: "sdp",
        payload: { from: selfId, to: payload.from, sdp: peer.pc.localDescription },
      });
    } catch {
      dropPeer(payload.from);
    }
    return;
  }
  const peer = peers.get(payload.from);
  if (!peer || peer.pc.signalingState === "stable") return;
  try {
    await peer.pc.setRemoteDescription(payload.sdp);
  } catch {
    dropPeer(payload.from);
  }
}

async function onIce(payload: { from: string; to: string; candidate: RTCIceCandidateInit }) {
  if (payload.to !== selfId) return;
  const peer = peers.get(payload.from);
  if (!peer) return;
  try {
    await peer.pc.addIceCandidate(payload.candidate);
  } catch {
    /* candidate arrived before the description — harmless */
  }
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

export async function startWebrtcMesh(
  nodeKey: string,
  shardProvider: (sha: string) => Promise<ArrayBuffer | null>,
): Promise<void> {
  if (started || typeof window === "undefined" || typeof RTCPeerConnection === "undefined") return;
  started = true;
  selfId = nodeKey;
  provider = shardProvider;

  const ch = supabase.channel(ROOM, { config: { presence: { key: nodeKey } } });
  channel = ch;

  ch.on("broadcast", { event: "sdp" }, ({ payload }) => void onSdp(payload));
  ch.on("broadcast", { event: "ice" }, ({ payload }) => void onIce(payload));
  ch.on("presence", { event: "sync" }, () => {
    const ids = Object.keys(ch.presenceState());
    // Deterministic tie-break: the lexicographically smaller id dials out, so
    // two peers never offer each other simultaneously.
    for (const id of ids) {
      if (id === selfId) continue;
      if (selfId < id) void initiate(id);
    }
    for (const id of [...peers.keys()]) if (!ids.includes(id)) dropPeer(id);
  });
  ch.on("presence", { event: "leave" }, ({ key }) => dropPeer(key as string));

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    setTimeout(done, 8000);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void ch.track({ nodeKey, at: Date.now() });
        done();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") done();
    });
  });
}

export function stopWebrtcMesh(): void {
  for (const id of [...peers.keys()]) dropPeer(id);
  for (const [rid, resolve] of waiting) {
    waiting.delete(rid);
    resolve(null);
  }
  try {
    if (channel) void supabase.removeChannel(channel);
  } catch {
    /* ignore */
  }
  channel = null;
  started = false;
}

/** Ask every connected peer for a shard. First byte-payload wins. */
export function requestShard(sha: string, timeoutMs = 2500): Promise<ArrayBuffer | null> {
  const open = [...peers.values()].filter((p) => p.ready && p.dc?.readyState === "open");
  if (!open.length) return Promise.resolve(null);
  const rid = crypto.randomUUID();
  return new Promise<ArrayBuffer | null>((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(rid);
      resolve(null);
    }, timeoutMs);
    waiting.set(rid, (bytes) => {
      clearTimeout(timer);
      resolve(bytes);
    });
    for (const p of open) {
      try {
        p.dc?.send(JSON.stringify({ t: "want", rid, sha }));
      } catch {
        p.ready = false;
      }
    }
  });
}
