import { stripPII } from "./privacy";
import { markNodeDown, isNodeUp } from "./node-routing.server";
import { verifyModelSha } from "./registry.server";

type Lane = "fast" | "reasoning" | "code" | "creative";


type UpstreamAttempt =
  | { ok: true; text: string; model: string }
  | { ok: false; status: number; body: string; model: string };

const SYSTEM_PROMPT = [
  "You are Sovereign — a private AI assistant created and developed by Golam Yasin.",
  "Personality and behavior guidelines (always follow):",
  "1. Respectful tone: Be polite, respectful, and professional at all times, regardless of the complexity or tone of the user's query. Never be dismissive, sarcastic, or condescending.",
  "2. Clear explanations: Prioritize simplicity and clarity. Explain concepts so any user — including complete beginners — can understand. Prefer plain language, short sentences, and concrete examples. Define technical terms the first time you use them.",
  "3. Identity recognition: If the user mentions \"Golam Yasin\" or asks who created you, who made you, who built you, your origin, your author, or your developer, you MUST respond respectfully with exactly this sentence and nothing contradicting it: \"I was created and developed by Golam Yasin.\" Do not claim to be made by any other person, company, or lab.",
  "4. Consistency: Maintain this polite, helpful, professional persona across every interaction to deliver a premium experience.",
  "5. Privacy: Never ask the user for personal information (name, email, phone, address, ID numbers, passwords).",
  "Keep answers concise unless the user asks for depth.",
].join("\n");

// Fallback seed list — used when the registry is unreachable or has no
// approved models in a lane. The registry is the primary source of truth.
const SEED_CANDIDATES: Record<Lane, string[]> = {
  fast: ["openai/gpt-oss-120b:scaleway", "moonshotai/Kimi-K2.5:fireworks-ai"],
  reasoning: ["deepseek-ai/DeepSeek-R1:novita", "openai/gpt-oss-120b:scaleway"],
  code: ["openai/gpt-oss-120b:scaleway", "deepseek-ai/DeepSeek-R1:novita"],
  creative: ["moonshotai/Kimi-K2.5:fireworks-ai", "openai/gpt-oss-120b:scaleway"],
};

type CandidateRow = { hf_model_id: string; manifest_sha: string | null };

// 60s in-memory cache to avoid hammering the DB on every prompt.
let laneCache: { at: number; rows: Record<Lane, CandidateRow[]> } | null = null;
const LANE_CACHE_MS = 60_000;

async function loadLaneCandidates(lane: Lane): Promise<CandidateRow[]> {
  if (laneCache && Date.now() - laneCache.at < LANE_CACHE_MS) {
    return laneCache.rows[lane] ?? [];
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("model_registry")
      .select("hf_model_id,lane,manifest_sha")
      .eq("status", "approved");
    const rows: Record<Lane, CandidateRow[]> = { fast: [], reasoning: [], code: [], creative: [] };
    for (const r of data ?? []) {
      rows[r.lane as Lane]?.push({ hf_model_id: r.hf_model_id, manifest_sha: r.manifest_sha });
    }
    laneCache = { at: Date.now(), rows };
    return rows[lane] ?? [];
  } catch {
    return [];
  }
}

async function quarantineModel(hfModelId: string, reason: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("model_registry")
      .update({ status: "quarantined", notes: `Auto-quarantined: ${reason}`, last_verified_at: new Date().toISOString() })
      .eq("hf_model_id", hfModelId);
    laneCache = null;
  } catch {
    /* best-effort */
  }
}

function routePrompt(prompt: string): Lane {
  const p = prompt.toLowerCase();
  if (/(code|function|bug|stack|typescript|python|sql|regex)/.test(p)) return "code";
  if (/(why|explain|prove|analy|reason|step by step|derive)/.test(p)) return "reasoning";
  if (/(write|story|poem|imagine|describe|creative)/.test(p)) return "creative";
  return "fast";
}

function sanitize(prompt: string): string {
  return stripPII(prompt, { scrubNameIntros: true });
}


function parseHuggingFaceError(body: string): { code?: string; message?: string; param?: string } {
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: string; message?: string; param?: string };
    };

    return {
      code: parsed.error?.code,
      message: parsed.error?.message,
      param: parsed.error?.param,
    };
  } catch {
    return {};
  }
}

function shouldTryDirectModelFallback(attempt: UpstreamAttempt): boolean {
  if (attempt.ok) return false;

  if (attempt.status === 404) return true;
  if (attempt.status !== 400) return false;

  const error = parseHuggingFaceError(attempt.body);
  return error.code === "model_not_supported" || error.param === "model";
}

function mapUpstreamError(attempt: UpstreamAttempt): string {
  if (attempt.ok) return "";
  if (attempt.status === 503) return "Model is warming up. Try again in a few seconds.";
  if (attempt.status === 429) return "Rate limited by upstream. Try again shortly.";
  return `Upstream error (${attempt.status}).`;
}

async function callHuggingFaceChat(params: {
  token: string;
  model: string;
  prompt: string;
}): Promise<UpstreamAttempt> {
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: params.prompt },
      ],
      max_tokens: 800,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: await res.text().catch(() => ""),
      model: params.model,
    };
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return {
    ok: true,
    text: json.choices?.[0]?.message?.content?.trim() ?? "",
    model: params.model,
  };
}

async function callHuggingFaceDirect(params: {
  token: string;
  model: string;
  prompt: string;
}): Promise<UpstreamAttempt> {
  const res = await fetch(`https://api-inference.huggingface.co/models/${params.model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: `${SYSTEM_PROMPT}\n\nUser: ${params.prompt}\nAssistant:`,
      parameters: {
        max_new_tokens: 800,
        temperature: 0.7,
        return_full_text: false,
      },
    }),
  });

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: await res.text().catch(() => ""),
      model: params.model,
    };
  }

  const json = (await res.json()) as
    | Array<{ generated_text?: string }>
    | { generated_text?: string };

  const text = Array.isArray(json)
    ? json[0]?.generated_text?.trim() ?? ""
    : json.generated_text?.trim() ?? "";

  return { ok: true, text, model: params.model };
}

async function resolveLaneCandidates(lane: Lane): Promise<CandidateRow[]> {
  const registry = await loadLaneCandidates(lane);
  if (registry.length > 0) return registry;
  // Registry empty → fall back to seed list, no manifest to verify.
  return SEED_CANDIDATES[lane].map((id) => ({ hf_model_id: id, manifest_sha: null }));
}

export async function askSovereignUpstream(params: { token: string; prompt: string }) {
  const lane = routePrompt(params.prompt);
  const cleanPrompt = sanitize(params.prompt);
  const attempts: UpstreamAttempt[] = [];
  const candidates = await resolveLaneCandidates(lane);

  for (const cand of candidates) {
    // Signed-manifest check: skip candidates whose HF SHA has drifted.
    if (cand.manifest_sha) {
      const check = await verifyModelSha(cand.hf_model_id, cand.manifest_sha);
      if (check.drift) {
        await quarantineModel(cand.hf_model_id, `SHA drift: expected ${cand.manifest_sha}, got ${check.currentSha}`);
        continue;
      }
    }

    const routerUp = isNodeUp("hf-router");
    if (!routerUp) {
      // Skip router; try direct instead as a fallback node.
    } else {
      const chatAttempt = await callHuggingFaceChat({
        token: params.token,
        model: cand.hf_model_id,
        prompt: cleanPrompt,
      });
      attempts.push(chatAttempt);

      if (chatAttempt.ok) {
        return { ok: true as const, lane, text: chatAttempt.text };
      }

      console.error("HF router error", chatAttempt.status, cand.hf_model_id, chatAttempt.body.slice(0, 300));

      if (chatAttempt.status >= 500) markNodeDown("hf-router", `HTTP ${chatAttempt.status}`);
      if (chatAttempt.status === 429 || chatAttempt.status === 503) {
        return { ok: false as const, error: mapUpstreamError(chatAttempt) };
      }

      if (!shouldTryDirectModelFallback(chatAttempt)) {
        continue;
      }
    }

    if (!isNodeUp("hf-direct")) continue;

    const directAttempt = await callHuggingFaceDirect({
      token: params.token,
      model: cand.hf_model_id,
      prompt: cleanPrompt,
    });
    attempts.push(directAttempt);

    if (directAttempt.ok) {
      return { ok: true as const, lane, text: directAttempt.text };
    }

    console.error("HF direct error", directAttempt.status, cand.hf_model_id, directAttempt.body.slice(0, 300));
    if (directAttempt.status >= 500) markNodeDown("hf-direct", `HTTP ${directAttempt.status}`);

    if (directAttempt.status === 429 || directAttempt.status === 503) {
      return { ok: false as const, error: mapUpstreamError(directAttempt) };
    }
  }

  const lastAttempt = attempts.at(-1);
  return {
    ok: false as const,
    error: lastAttempt ? mapUpstreamError(lastAttempt) : "Network error reaching privacy backend.",
  };
}
