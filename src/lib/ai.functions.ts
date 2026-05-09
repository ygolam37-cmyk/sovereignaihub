import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askSovereignUpstream } from "./ai.server";

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
    try {
      return await askSovereignUpstream({ token: HF_TOKEN, prompt: data.prompt });
    } catch (e) {
      console.error("askSovereign failed", e);
      return { ok: false as const, error: "Network error reaching privacy backend." };
    }
  });
