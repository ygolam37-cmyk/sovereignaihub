/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
// Sovereign inference orchestrator — fully native.
// The only "provider" is this application's own deterministic engine plus the
// open web. No API keys, no model hosting service, no external endpoints.

import { stripPII } from "./privacy";
import { nativeAnswer, type Lane } from "./native-engine.server";
import type { SearchHit } from "./search.server";
import { markNodeDown, isNodeUp } from "./node-routing.server";

export type NativeResult = {
  ok: true;
  lane: Lane;
  text: string;
  audit: string;
};

export async function askSovereignNative(params: {
  prompt: string;
  hits: SearchHit[];
}): Promise<NativeResult | { ok: false; error: string }> {
  const clean = stripPII(params.prompt, { scrubNameIntros: true });

  if (!isNodeUp("native-engine")) {
    return { ok: false as const, error: "Native engine is recovering. Try again in a moment." };
  }

  try {
    const result = nativeAnswer({ prompt: clean, hits: params.hits });
    return { ok: true as const, ...result };
  } catch (e) {
    markNodeDown("native-engine", e instanceof Error ? e.message : "native failure");
    return { ok: false as const, error: "Native engine failed on this prompt." };
  }
}
