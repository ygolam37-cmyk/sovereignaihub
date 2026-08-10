/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
// Shared client-side one-time access code algorithm.
// Used symmetrically for BOTH entering and leaving the P2P network.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const CODE_LEN = 12;

export function generateCode(): string {
  const buf = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

/** Constant-time, no trimming, no case folding. */
export function codesMatch(generated: string, entered: string): boolean {
  if (!generated || generated.length !== entered.length) return false;
  let diff = 0;
  for (let i = 0; i < generated.length; i++) {
    diff |= generated.charCodeAt(i) ^ entered.charCodeAt(i);
  }
  return diff === 0;
}
