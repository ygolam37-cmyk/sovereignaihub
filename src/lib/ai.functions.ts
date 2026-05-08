import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Curated open-source models routed through Hugging Face Inference API.
// The "agentic router" picks based on prompt characteristics. Identity is
// stripped before any outbound call — HF only sees the clean prompt.
const MODEL_ROUTES = {
  fast: "meta-llama/Llama-3.2-3B-Instruct",
  reasoning: "meta-llama/Meta-Llama-3.1-8B-Instruct",
  code: "Qwen/Qwen2.5-Coder-32B-Instruct",
  creative: "mistralai/Mistral-7B-Instruct-v0.3",
} as const;

type Lane = keyof typeof MODEL_ROUTES;

function routePrompt(prompt: string): Lane {
  const p = prompt.toLowerCase();
  if (/(code|function|bug|stack|typescript|python|sql|regex)/.test(p)) return "code";
  if (/(why|explain|prove|analy|reason|step by step|derive)/.test(p)) return "reasoning";
  if (/(write|story|poem|imagine|describe|creative)/.test(p)) return "creative";
  return "fast";
}

// Strip obvious PII before the prompt leaves our servers.
function sanitize(prompt: string): string {
  return prompt
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/\b\d{1,5}\s+[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd)\b/g, "[address]");
}

const InputSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
});

async function callHuggingFaceChat(params: {
  token: string;
  model: string;
  prompt: string;
}) {
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: "system",
          content:
            "You are Sovereign — a private AI assistant. Be concise, clear, and helpful. Never ask the user for personal information.",
        },
        { role: "user", content: params.prompt },
      ],
      max_tokens: 800,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, body };
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return {
    ok: true as const,
    text: json.choices?.[0]?.message?.content?.trim() ?? "",
  };
}

async function callHuggingFaceFallback(params: {
  token: string;
  model: string;
  prompt: string;
}) {
  const res = await fetch(`https://api-inference.huggingface.co/models/${params.model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: `<|system|>You are Sovereign — a private AI assistant. Be concise, clear, and helpful. Never ask the user for personal information.</s><|user|>${params.prompt}</s><|assistant|>`,
      parameters: {
        max_new_tokens: 800,
        temperature: 0.7,
        return_full_text: false,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, body };
  }

  const json = (await res.json()) as
    | Array<{ generated_text?: string }>
    | { generated_text?: string };

  const text = Array.isArray(json)
    ? json[0]?.generated_text?.trim() ?? ""
    : json.generated_text?.trim() ?? "";

  return { ok: true as const, text };
}

export const askSovereign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const HF_TOKEN = process.env.HF_TOKEN;
    if (!HF_TOKEN) {
      return { ok: false as const, error: "Privacy backend not configured." };
    }

    const lane = routePrompt(data.prompt);
    const model = MODEL_ROUTES[lane];
    const cleanPrompt = sanitize(data.prompt);

    // No user id, email, or session token is forwarded. Only the clean prompt.
    try {
      const primary = await callHuggingFaceChat({
        token: HF_TOKEN,
        model,
        prompt: cleanPrompt,
      });

      if (primary.ok) {
        return { ok: true as const, lane, text: primary.text };
      }

      if (primary.status !== 404) {
        console.error("HF error", primary.status, primary.body.slice(0, 300));
        if (primary.status === 503) {
          return { ok: false as const, error: "Model is warming up. Try again in a few seconds." };
        }
        if (primary.status === 429) {
          return { ok: false as const, error: "Rate limited by upstream. Try again shortly." };
        }
        return { ok: false as const, error: `Upstream error (${primary.status}).` };
      }

      const fallback = await callHuggingFaceFallback({
        token: HF_TOKEN,
        model,
        prompt: cleanPrompt,
      });

      if (fallback.ok) {
        return { ok: true as const, lane, text: fallback.text };
      }

      console.error("HF fallback error", fallback.status, fallback.body.slice(0, 300));
      if (fallback.status === 503) {
        return { ok: false as const, error: "Model is warming up. Try again in a few seconds." };
      }
      if (fallback.status === 429) {
        return { ok: false as const, error: "Rate limited by upstream. Try again shortly." };
      }

      return { ok: false as const, error: `Upstream error (${fallback.status}).` };
    } catch (e) {
      console.error("askSovereign failed", e);
      return { ok: false as const, error: "Network error reaching privacy backend." };
    }
  });
