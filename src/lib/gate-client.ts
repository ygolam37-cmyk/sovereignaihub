/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { gateChallenge, gateStatus, openGate } from "./gate.functions";

let inflight: Promise<boolean> | null = null;
let opened = false;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function solve(challenge: string, difficulty: number): Promise<string> {
  const target = "0".repeat(difficulty);
  for (let n = 0; ; n++) {
    const candidate = n.toString(36);
    if ((await sha256Hex(`${challenge}:${candidate}`)).startsWith(target)) return candidate;
    // Keep the UI thread fluid while grinding.
    if (n % 256 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}

/**
 * Makes sure this browser holds a valid server-side gate session before any
 * protected server function is called. Idempotent and cached per page load.
 */
export async function ensureGate(): Promise<boolean> {
  if (opened) return true;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if ((await gateStatus()).ok) return (opened = true);
      const { challenge, difficulty } = await gateChallenge();
      const solution = await solve(challenge, difficulty);
      const res = await openGate({ data: { challenge, solution } });
      return (opened = res.ok);
    } catch {
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
