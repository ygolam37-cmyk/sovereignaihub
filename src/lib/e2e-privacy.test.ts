import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchOpenSource } from "./search.server";
import { askSovereignUpstream } from "./ai.server";
import { reviewWorkerResponse } from "./manager.server";
import { identityFirewall } from "./privacy";

// End-to-end: live search → scrape → worker LLM → manager review → firewall.
// Every network hop is mocked to return PII-laden payloads. We assert the
// final user-facing text has NO identifier left.

const PII_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\+?\d[\d\s().-]{7,}\d/,
  /\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|Ave|Avenue|Road|Rd|Blvd|Lane|Drive|Dr)\b/,
];

function assertScrubbed(text: string) {
  for (const re of PII_PATTERNS) {
    expect(text, `PII leak matched ${re}: ${text}`).not.toMatch(re);
  }
}

const POISON_TITLE = "Leak: alice@example.com aadhaar 1234 5678 9012";
const POISON_SNIPPET =
  "Reach +1 415-555-0142 at 221 Baker Street, SSN 123-45-6789, card 4111 1111 1111 1111.";

function html(body: string) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}
function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function ddgHtml() {
  return `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(
    "https://a.example.com/1",
  )}">${POISON_TITLE}</a><a class="result__snippet">${POISON_SNIPPET}</a>`;
}
function bingHtml() {
  return `<li class="b_algo"><h2><a href="https://b.example.com/1">${POISON_TITLE}</a></h2><p>${POISON_SNIPPET}</p></li>`;
}
function newsRss() {
  return `<?xml version="1.0"?><rss><channel><item><title>${POISON_TITLE}</title><link>https://n.example.com/1</link><description>${POISON_SNIPPET}</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
}

describe("end-to-end privacy firewall", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        // HuggingFace router — both worker LLM and manager review.
        if (url.includes("router.huggingface.co")) {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          const isManager = (body.messages?.[0]?.content ?? "").includes(
            "Sovereign Manager Agent",
          );
          if (isManager) {
            // Manager returns strict JSON. Simulate a rewrite that STILL contains
            // PII — the outbound identityFirewall must strip it before delivery.
            return json({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      verdict: "approve",
                      reason: "clean",
                      final: `According to sources, contact leaked@example.com and 415-555-0142. Aadhaar 1234-5678-9012 exposed.`,
                    }),
                  },
                },
              ],
            });
          }
          // Worker draft — also full of PII pulled from scraped context.
          return json({
            choices: [
              {
                message: {
                  content: `Draft answer citing alice@example.com and 221 Baker Street with SSN 123-45-6789.`,
                },
              },
            ],
          });
        }

        // Search engines.
        if (url.includes("format=json"))
          return json({
            results: [
              { title: POISON_TITLE, url: "https://s.example.com/1", content: POISON_SNIPPET },
            ],
          });
        if (url.includes("duckduckgo.com")) return html(ddgHtml());
        if (url.includes("bing.com/news")) return html(newsRss());
        if (url.includes("bing.com")) return html(bingHtml());
        if (url.includes("news.google.com")) return html(newsRss());
        if (url.includes("brave.com")) return html("");
        if (url.includes("whoogle") || url.includes("albony")) return html("");
        return new Response("", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("delivers a fully scrubbed final response through the whole pipeline", async () => {
    // 1. Live research + scrape
    const research = await researchOpenSource("latest breaking news", 5);
    expect(research.hits.length).toBeGreaterThan(0);
    for (const h of research.hits) {
      assertScrubbed(h.title);
      assertScrubbed(h.snippet);
    }

    // 2. Build augmented prompt (mirrors ai.functions.ts)
    const context = research.hits
      .map((h, i) => `[${i + 1}] ${h.title}\n${h.snippet}\nSource: ${h.url}`)
      .join("\n\n");
    const augmented = `${context}\n\nUser question: what happened today?`;

    // 3. Worker LLM
    const worker = await askSovereignUpstream({
      token: "test-token",
      prompt: augmented,
    });
    expect(worker.ok).toBe(true);
    if (!worker.ok) return;

    // 4. Manager recursive validation
    const review = await reviewWorkerResponse({
      token: "test-token",
      userPrompt: "what happened today?",
      draft: worker.text,
    });

    // 5. Outbound identity firewall — final user-facing text
    const finalText = identityFirewall(review.final);

    assertScrubbed(finalText);
    // Redaction tokens should appear, proving the firewall actually ran.
    expect(finalText).toMatch(/\[(email|id|phone|address|ssn|card)\]/);

    // Audit trail is present
    expect(review.audit).toMatch(/Reasoning Audit/);
    expect(research.audit.audit).toMatch(/privacy\.ts/i);
  });
});
