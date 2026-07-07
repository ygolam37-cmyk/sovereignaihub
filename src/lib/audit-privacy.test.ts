import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewWorkerResponse } from "./manager.server";
import { researchOpenSource } from "./search.server";

const PII_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\+?\d[\d\s().-]{7,}\d/,
  /\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|Ave|Avenue|Road|Rd|Blvd|Lane|Drive|Dr|Terrace)\b/,
];

function assertScrubbed(text: string) {
  for (const re of PII_PATTERNS) {
    expect(text, `PII leak matched ${re}: ${text}`).not.toMatch(re);
  }
}

describe("Reasoning Audit privacy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("scrubs PII the manager LLM leaks into its `reason` field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    verdict: "rewrite",
                    // Manager tries to quote user PII inside its audit note.
                    reason:
                      "user shared alice@example.com and phone +1 415-555-2671, aadhaar 1234 5678 9012, ssn 123-45-6789, card 4111 1111 1111 1111, addr 221 Baker Street",
                    final: "Here is a safe answer.",
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const review = await reviewWorkerResponse({
      token: "t",
      userPrompt: "hi my name is Alice Smith, email alice@example.com",
      draft: "draft",
    });

    expect(review.audit).toMatch(/Reasoning Audit/);
    assertScrubbed(review.audit);
    // Redaction tokens prove the firewall ran on the audit string itself.
    expect(review.audit).toMatch(/\[(email|id|phone|address|ssn|card)\]/);
  });

  it("keeps the research audit free of PII even when engine payloads are poisoned", async () => {
    const POISON =
      "leak alice@example.com +1 415-555-2671 aadhaar 1234 5678 9012 ssn 123-45-6789";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("format=json"))
          return new Response(
            JSON.stringify({
              results: [{ title: POISON, url: "https://x.example.com/1", content: POISON }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        return new Response("", { status: 404 });
      }),
    );

    const research = await researchOpenSource("what happened today?", 3);
    assertScrubbed(research.audit.audit);
    // The audit string should never quote raw hit content.
    expect(research.audit.audit).not.toContain("alice");
    expect(research.audit.audit).toMatch(/Reasoning Audit/);
  });
});
