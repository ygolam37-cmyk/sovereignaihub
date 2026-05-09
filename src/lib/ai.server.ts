type Lane = "fast" | "reasoning" | "code" | "creative";

type UpstreamAttempt =
  | { ok: true; text: string; model: string }
  | { ok: false; status: number; body: string; model: string };

const SYSTEM_PROMPT =
  "You are Sovereign — a private AI assistant. Be concise, clear, and helpful. Never ask the user for personal information.";

const MODEL_CANDIDATES: Record<Lane, string[]> = {
  fast: ["openai/gpt-oss-120b:scaleway", "moonshotai/Kimi-K2.5:fireworks-ai"],
  reasoning: ["deepseek-ai/DeepSeek-R1:novita", "openai/gpt-oss-120b:scaleway"],
  code: ["openai/gpt-oss-120b:scaleway", "deepseek-ai/DeepSeek-R1:novita"],
  creative: ["moonshotai/Kimi-K2.5:fireworks-ai", "openai/gpt-oss-120b:scaleway"],
};

function routePrompt(prompt: string): Lane {
  const p = prompt.toLowerCase();
  if (/(code|function|bug|stack|typescript|python|sql|regex)/.test(p)) return "code";
  if (/(why|explain|prove|analy|reason|step by step|derive)/.test(p)) return "reasoning";
  if (/(write|story|poem|imagine|describe|creative)/.test(p)) return "creative";
  return "fast";
}

function sanitize(prompt: string): string {
  return prompt
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/\b\d{1,5}\s+[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd)\b/g, "[address]");
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

export async function askSovereignUpstream(params: { token: string; prompt: string }) {
  const lane = routePrompt(params.prompt);
  const cleanPrompt = sanitize(params.prompt);
  const attempts: UpstreamAttempt[] = [];

  for (const model of MODEL_CANDIDATES[lane]) {
    const chatAttempt = await callHuggingFaceChat({
      token: params.token,
      model,
      prompt: cleanPrompt,
    });
    attempts.push(chatAttempt);

    if (chatAttempt.ok) {
      return { ok: true as const, lane, text: chatAttempt.text };
    }

    console.error("HF router error", chatAttempt.status, model, chatAttempt.body.slice(0, 300));

    if (chatAttempt.status === 429 || chatAttempt.status === 503) {
      return { ok: false as const, error: mapUpstreamError(chatAttempt) };
    }

    if (!shouldTryDirectModelFallback(chatAttempt)) {
      continue;
    }

    const directAttempt = await callHuggingFaceDirect({
      token: params.token,
      model,
      prompt: cleanPrompt,
    });
    attempts.push(directAttempt);

    if (directAttempt.ok) {
      return { ok: true as const, lane, text: directAttempt.text };
    }

    console.error("HF direct error", directAttempt.status, model, directAttempt.body.slice(0, 300));

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