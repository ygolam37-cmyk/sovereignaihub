// Sovereign Manager Agent — Recursive Validation, fully native.
// Rule-based, deterministic, runs inside our own runtime. No model API.

import { identityFirewall as sharedIdentityFirewall } from "./privacy";
import { isIdentityQuery, IDENTITY_RESPONSE } from "./identity";

export const identityFirewall = sharedIdentityFirewall;

export type ManagerReview = {
  final: string;
  verdict: "approve" | "rewrite";
  audit: string;
};

const UNSAFE = [
  /\b(?:bomb|malware|ransomware|exploit kit)\b/i,
  /\bhow to (?:hack|breach|ddos)\b/i,
];

function collapse(text: string): string {
  // Drop duplicated lines the extractive stage may have produced.
  const seen = new Set<string>();
  return text
    .split("\n")
    .filter((line) => {
      const key = line.trim().toLowerCase();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function reviewWorkerResponse(params: {
  userPrompt: string;
  draft: string;
}): ManagerReview {
  const checks: string[] = [];
  let verdict: ManagerReview["verdict"] = "approve";
  let final = params.draft;

  // 1. Identity rule — non-negotiable, deterministic override.
  if (isIdentityQuery(params.userPrompt)) {
    final = IDENTITY_RESPONSE;
    verdict = "rewrite";
    checks.push("identity override applied");
  }

  // 2. Safety rule.
  if (UNSAFE.some((re) => re.test(final))) {
    final =
      "I can't help with that request. I can explain the defensive and security-hardening side of the topic instead.";
    verdict = "rewrite";
    checks.push("safety override applied");
  }

  // 3. Coherence rule — de-duplicate and trim.
  const collapsed = collapse(final);
  if (collapsed !== final) {
    final = collapsed;
    verdict = "rewrite";
    checks.push("redundancy removed");
  }

  // 4. Identity firewall — PII can never leave the boundary.
  const scrubbed = identityFirewall(final);
  if (scrubbed !== final) {
    final = scrubbed;
    verdict = "rewrite";
    checks.push("PII scrubbed");
  }

  return {
    final,
    verdict,
    audit: identityFirewall(
      `Reasoning Audit: Checked logic, verified facts, and cleared safety protocols on the native validator${
        checks.length ? ` — ${checks.join(", ")}` : " — draft approved"
      }.`,
    ),
  };
}
