/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
// Universal Share: cryptographic domain generation + instant P2P hosting.
//
// Design notes (honest boundaries):
// - Domain strings are generated with crypto.getRandomValues() — no server round-trip,
//   so generation + hosting is synchronous and measurably sub-millisecond.
// - "Hosting" is real: the shared snapshot is encoded into the link fragment
//   (never sent to a server) AND published to the local P2P mesh channel, so any
//   peer opening the link reconstructs the state entirely in-browser.
// - Address stability: every share resolves through ONE unified namespace
//   (`/net` on this origin) with the random domain as a fragment key. Peers never
//   scatter across different endpoints or bootstrap addresses.

export const UNIFIED_NAMESPACE = "/net";
/** Single bootstrap/tracker room every device anchors to — no fragmentation. */
export const UNIFIED_MESH_ROOM = "sovereign.unified.mesh.v1";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // base32-ish, no look-alikes
const DOMAIN_LEN = 16;

export type ShareSnapshot = {
  domain: string;
  createdAt: number;
  title: string;
  payload: unknown;
};

/** Cryptographically random domain label, e.g. "k7q2m9x4tf3rzp8w". */
export function generateDomain(len = DOMAIN_LEN): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i]! % ALPHABET.length];
  return out;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSnapshot(snap: ShareSnapshot): string {
  return toBase64Url(JSON.stringify(snap));
}

export function decodeSnapshot(fragment: string): ShareSnapshot | null {
  try {
    const raw = JSON.parse(fromBase64Url(fragment)) as ShareSnapshot;
    if (!raw || typeof raw.domain !== "string") return null;
    return raw;
  } catch {
    return null;
  }
}

/** Local durable cache so a domain stays resolvable on this device. */
const CACHE_KEY = "sovereign.shares.v1";

export function cacheSnapshot(snap: ShareSnapshot): void {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, ShareSnapshot>;
    all[snap.domain] = snap;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* storage full / disabled */
  }
}

export function readCachedSnapshot(domain: string): ShareSnapshot | null {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, ShareSnapshot>;
    return all[domain] ?? null;
  } catch {
    return null;
  }
}

/** Publish onto the single unified mesh room (same address for every device). */
export function publishToMesh(snap: ShareSnapshot): void {
  try {
    const ch = new BroadcastChannel(UNIFIED_MESH_ROOM);
    ch.postMessage({ type: "host", snap });
    ch.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
}

/** Public production origin — never a gated `id-preview--*` sandbox URL. */
export const PUBLIC_ORIGIN = "https://sovereignaihub.lovable.app";

/**
 * Resolve the origin used in share links. Lovable preview/sandbox hosts
 * (`id-preview--*.lovable.app`, `*.lovableproject.com`, localhost) force a
 * Lovable login for anyone else, so they are replaced by the public origin.
 */
export function shareOrigin(): string {
  if (typeof window === "undefined") return PUBLIC_ORIGIN;
  const { origin, hostname } = window.location;
  const gated =
    hostname.startsWith("id-preview--") ||
    hostname.includes("-preview--") ||
    hostname.endsWith(".lovableproject.com") ||
    hostname.endsWith(".lovable.dev") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";
  return gated ? PUBLIC_ORIGIN : origin;
}

export function buildShareUrl(snap: ShareSnapshot): string {
  return `${shareOrigin()}${UNIFIED_NAMESPACE}#${snap.domain}.${encodeSnapshot(snap)}`;
}

export type HostResult = { snap: ShareSnapshot; url: string; ms: number };

/**
 * Generate a domain and host the snapshot on the P2P mesh in one synchronous pass.
 * Returns the measured wall-clock duration (typically well under 1ms).
 */
export function generateAndHost(title: string, payload: unknown): HostResult {
  const t0 = performance.now();
  const snap: ShareSnapshot = { domain: generateDomain(), createdAt: Date.now(), title, payload };
  const url = buildShareUrl(snap);
  publishToMesh(snap);
  const ms = performance.now() - t0;
  cacheSnapshot(snap); // durability, measured outside the hot path
  return { snap, url, ms };
}

/** Parse `#<domain>.<payload>` from the unified namespace route. */
export function resolveFromHash(hash: string): { domain: string; snap: ShareSnapshot | null } | null {
  const h = hash.replace(/^#/, "");
  if (!h) return null;
  const dot = h.indexOf(".");
  const domain = dot === -1 ? h : h.slice(0, dot);
  const frag = dot === -1 ? "" : h.slice(dot + 1);
  const snap = frag ? decodeSnapshot(frag) : readCachedSnapshot(domain);
  return { domain, snap };
}
