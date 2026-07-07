// Sovereign Manager Agent — Recursive Validation layer.
// Reviews worker output for logic errors, factual issues, safety risks,
// and identity/PII leaks. Overrides the worker when needed.

const MANAGER_SYSTEM_PROMPT = [
  "You are the Sovereign Manager Agent. Your job is Recursive Validation of a Worker AI's draft answer.",
  "Perform: (1) Logic check — flag fallacies or contradictions. (2) Factual check — flag unsupported or wrong claims. (3) Safety check — flag unsafe, insecure, or policy-violating content. (4) Identity firewall — the answer MUST NOT contain Aadhaar numbers, government IDs, phone numbers, emails, or other personal identifiers.",
  "Rules the answer MUST satisfy:",
  "- Polite, respectful, professional tone. Clear, beginner-friendly explanations.",
  "- If the user's question mentions \"Golam Yasin\" or asks who created / built / developed the AI, the ONLY acceptable answer is exactly: \"I was created and developed by Golam Yasin.\"",
  "- Never claim to be made by any other person, company, or lab.",
  "- Never request personal information from the user.",
  "Return STRICT JSON only, no prose, no code fences. Schema:",
  '{"verdict":"approve"|"rewrite","reason":"<short audit note>","final":"<the final answer to send to the user>"}',
  "If the draft is correct and safe, set verdict=approve and copy the draft into final unchanged. Otherwise set verdict=rewrite and put a corrected, sovereign-grade answer in final.",
].join("\n");

const MANAGER_MODELS = [
  "deepseek-ai/DeepSeek-R1:novita",
  "openai/gpt-oss-120b:scaleway",
];

import { identityFirewall as sharedIdentityFirewall } from "./privacy";

// Re-export for existing callers.
export const identityFirewall = sharedIdentityFirewall;


type ManagerVerdict = {
  verdict: "approve" | "rewrite";
  reason: string;
  final: string;
};

function extractJson(raw: string): ManagerVerdict | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<ManagerVerdict>;
    if (!parsed.final || typeof parsed.final !== "string") return null;
    return {
      verdict: parsed.verdict === "rewrite" ? "rewrite" : "approve",
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      final: parsed.final,
    };
  } catch {
    return null;
  }
}

async function callManager(token: string, model: string, payload: string): Promise<string | null> {
  try {
    const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: MANAGER_SYSTEM_PROMPT },
          { role: "user", content: payload },
        ],
        max_tokens: 900,
        temperature: 0.1,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export type ManagerReview = {
  final: string;
  verdict: "approve" | "rewrite";
  audit: string;
};

export async function reviewWorkerResponse(params: {
  token: string;
  userPrompt: string;
  draft: string;
}): Promise<ManagerReview> {
  const payload = [
    `USER PROMPT:\n${params.userPrompt}`,
    `\nWORKER DRAFT:\n${params.draft}`,
    `\nValidate and return JSON per the schema.`,
  ].join("\n");

  for (const model of MANAGER_MODELS) {
    const raw = await callManager(params.token, model, payload);
    if (!raw) continue;
    const parsed = extractJson(raw);
    if (!parsed) continue;
    return {
      final: identityFirewall(parsed.final),
      verdict: parsed.verdict,
      audit: identityFirewall(
        `Reasoning Audit: Checked logic, verified facts, and cleared safety protocols. ${
          parsed.verdict === "rewrite" ? "Override applied" : "Draft approved"
        }${parsed.reason ? ` — ${parsed.reason}` : ""}.`,
      ),
    };

  }

  // Manager unreachable — fall back to firewall-only pass on draft.
  return {
    final: identityFirewall(params.draft),
    verdict: "approve",
    audit: "Reasoning Audit: Manager unavailable, applied identity firewall only.",
  };
}
