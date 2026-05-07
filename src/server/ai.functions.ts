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
      const res = await fetch(
        `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are Sovereign — a private AI assistant. Be concise, clear, and helpful. Never ask the user for personal information.",
              },
              { role: "user", content: cleanPrompt },
            ],
            max_tokens: 800,
            temperature: 0.7,
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("HF error", res.status, body.slice(0, 300));
        if (res.status === 503) {
          return { ok: false as const, error: "Model is warming up. Try again in a few seconds." };
        }
        if (res.status === 429) {
          return { ok: false as const, error: "Rate limited by upstream. Try again shortly." };
        }
        return { ok: false as const, error: `Upstream error (${res.status}).` };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content?.trim() ?? "";
      return { ok: true as const, lane, text };
    } catch (e) {
      console.error("askSovereign failed", e);
      return { ok: false as const, error: "Network error reaching privacy backend." };
    }
  });
