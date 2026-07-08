// Opt-in peer-node runtime.
// - Feature-detects WebGPU + WebRTC to advertise real capabilities.
// - Heartbeats the peer to the network every 30s so other users see it live.
// - Future: run tiny local models via transformers.js when WebGPU is available,
//   answering the caller's own prompts locally before hitting providers.

import { registerPeer } from "./registry.functions";

const NODE_KEY_STORAGE = "sovereign.peerNodeKey.v1";
const HEARTBEAT_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;

export type PeerCapabilities = { webgpu: boolean; webrtc: boolean };

export function detectPeerCapabilities(): PeerCapabilities {
  if (typeof window === "undefined") return { webgpu: false, webrtc: false };
  const webgpu = "gpu" in navigator;
  const webrtc = typeof RTCPeerConnection !== "undefined";
  return { webgpu, webrtc };
}

function ensureNodeKey(): string {
  const existing = localStorage.getItem(NODE_KEY_STORAGE);
  if (existing) return existing;
  const key = crypto.randomUUID();
  localStorage.setItem(NODE_KEY_STORAGE, key);
  return key;
}

export function isPeerNodeActive(): boolean {
  return timer !== null;
}

export async function startPeerNode(): Promise<{ ok: boolean; nodeKey?: string; error?: string }> {
  if (typeof window === "undefined") return { ok: false, error: "SSR" };
  const caps = detectPeerCapabilities();
  const nodeKey = ensureNodeKey();
  const ua = navigator.userAgent.slice(0, 200);

  const beat = async () => {
    try {
      await registerPeer({ data: { nodeKey, webgpu: caps.webgpu, ua } });
    } catch {
      /* best-effort */
    }
  };

  await beat();
  if (timer) clearInterval(timer);
  timer = setInterval(beat, HEARTBEAT_MS);
  return { ok: true, nodeKey };
}

export function stopPeerNode(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
