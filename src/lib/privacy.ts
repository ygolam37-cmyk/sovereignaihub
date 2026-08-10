/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
// Pure privacy helpers — no runtime deps, safe to unit-test.
// Used to strip personal identifiers BEFORE any model call and to
// scrub identifiers OUT of any model response before it reaches the user.

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const ADDRESS_RE =
  /\b\d{1,5}\s+[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Drive|Dr|Terrace|Terr|Way|Court|Ct|Place|Pl)\b/g;
// Aadhaar: exactly 12 digits, optional 4-4-4 spacing/dashes
const AADHAAR_RE = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
// Any other bare 12+ digit run (long IDs)
const LONG_ID_RE = /\b\d{12,}\b/g;
// SSN-style 9 digit id (3-2-4)
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
// Credit-card-like 13-19 digit runs with optional single-space/dash separators
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;

// "My name is X Y" / "I am X Y" / "I'm X Y"  (2-3 capitalized words)
const NAME_INTRO_RE =
  /\b(?:my name is|i am|i'm|this is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/gi;

export type PrivacyOptions = {
  // When true, additionally scrub "My name is …" style self-introductions.
  scrubNameIntros?: boolean;
};

/**
 * Strip personal identifiers from arbitrary text.
 * Applied to user prompts before they cross the model boundary,
 * and to model responses before they reach the UI.
 */
export function stripPII(text: string, opts: PrivacyOptions = {}): string {
  if (!text) return text;
  let out = text;

  // Order matters: card/ssn before Aadhaar so 16-digit runs aren't eaten
  // by the 12-digit Aadhaar pattern first.
  out = out.replace(EMAIL_RE, "[email]");
  out = out.replace(CARD_RE, (m) => (m.replace(/\D/g, "").length >= 13 ? "[card]" : m));
  out = out.replace(SSN_RE, "[ssn]");
  out = out.replace(AADHAAR_RE, "[id]");
  out = out.replace(LONG_ID_RE, "[id]");
  out = out.replace(PHONE_RE, "[phone]");
  out = out.replace(ADDRESS_RE, "[address]");


  if (opts.scrubNameIntros !== false) {
    out = out.replace(NAME_INTRO_RE, (_m, _name, offset, full) => {
      // Preserve the leading verb phrase, redact the name.
      const lead = full.slice(offset).match(/^(?:my name is|i am|i'm|this is|call me)/i);
      return `${lead ? lead[0] : "name"} [name]`;
    });
  }

  return out;
}

/** Alias used by outbound (model → user) filter. */
export const identityFirewall = (text: string): string => stripPII(text);
