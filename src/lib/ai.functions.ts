import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { askSovereignNative } from "./ai.server";
import { searchDuckDuckGo, researchOpenSource, type SearchHit } from "./search.server";
import { IDENTITY_RESPONSE, isIdentityQuery } from "./identity";
import { reviewWorkerResponse, identityFirewall } from "./manager.server";

const InputSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
});

const LIVE_INTENT =
  /\b(today|tonight|tomorrow|yesterday|now|current|latest|news|breaking|live|update|price|stock|score|weather|2024|2025|2026|2027|who is|what is|when did|when will|where is)\b/i;

function shouldSearch(prompt: string): boolean {
  return LIVE_INTENT.test(prompt) || prompt.trim().endsWith("?");
}

export const askSovereign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    // Deterministic identity/attribution guarantee.
    if (isIdentityQuery(data.prompt)) {
      return {
        ok: true as const,
        lane: "identity",
        text: IDENTITY_RESPONSE,
        sources: [],
        audit: "Reasoning Audit: Identity query — deterministic native response.",
      };
    }

    let hits: SearchHit[] = [];
    let researchAudit: string | undefined;
    if (shouldSearch(data.prompt)) {
      try {
        const research = await researchOpenSource(data.prompt, 5);
        hits = research.hits;
        researchAudit = research.audit.audit;
      } catch {
        hits = await searchDuckDuckGo(data.prompt, 5).catch(() => []);
      }
    }

    try {
      const res = await askSovereignNative({ prompt: data.prompt, hits });
      if (!res.ok) return res;

      // Recursive Validation — native manager reviews the draft.
      const review = reviewWorkerResponse({ userPrompt: data.prompt, draft: res.text });

      return {
        ok: true as const,
        lane: res.lane,
        text: identityFirewall(review.final),
        sources: hits,
        audit: [researchAudit, res.audit, review.audit].filter(Boolean).join("\n"),
        verdict: review.verdict,
      };
    } catch (e) {
      console.error("askSovereign failed", e);
      return { ok: false as const, error: "Native engine error." };
    }
  });
