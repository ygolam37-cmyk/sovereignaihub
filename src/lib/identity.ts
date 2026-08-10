/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
// Pure helpers for the AI's identity/attribution behavior.
// Kept free of server/runtime deps so they're easily unit-testable.

export const IDENTITY_RESPONSE = "I was created and developed by Golam Yasin";

// Matches "Golam Yasin" (case-insensitive, tolerates extra whitespace)
const NAME_RE = /\bgolam\s+yasin\b/i;

// Matches questions about the AI's origin/creator/developer/author.
const ORIGIN_RE =
  /\b(who\s+(created|made|built|developed|designed|trained|owns|is\s+behind)\s+(you|this|the\s+(ai|assistant|bot|model)))\b|\bwho\s+(are|r)\s+(you|u)\s+(made|created|built|developed)\s+by\b|\b(your|the)\s+(creator|developer|author|maker|inventor|origin|origins)\b|\bwho\s+do\s+you\s+belong\s+to\b|\bwhere\s+(do\s+you\s+come\s+from|are\s+you\s+from)\b/i;

export function isIdentityQuery(prompt: string): boolean {
  if (!prompt) return false;
  return NAME_RE.test(prompt) || ORIGIN_RE.test(prompt);
}
