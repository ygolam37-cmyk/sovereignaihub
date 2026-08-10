/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchOpenSource } from "./search.server";
import { askSovereignNative } from "./ai.server";
import { reviewWorkerResponse } from "./manager.server";
import { identityFirewall } from "./privacy";

// End-to-end: live search → scrape → native synthesis engine → native manager
// review → firewall. Every network hop is mocked to return PII-laden payloads.
// We assert the final user-facing text has NO identifier left, and that no
// third-party AI endpoint is ever contacted.

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

let contacted: string[] = [];

describe("end-to-end privacy firewall (native engine)", () => {
  beforeEach(() => {
    contacted = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        contacted.push(url);
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
        return new Response("", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("delivers a fully scrubbed final response with zero external AI calls", async () => {
    const research = await researchOpenSource("latest breaking news", 5);
    expect(research.hits.length).toBeGreaterThan(0);
    for (const h of research.hits) {
      assertScrubbed(h.title);
      assertScrubbed(h.snippet);
    }

    const worker = await askSovereignNative({
      prompt: "what happened today?",
      hits: research.hits,
    });
    expect(worker.ok).toBe(true);
    if (!worker.ok) return;

    const review = reviewWorkerResponse({
      userPrompt: "what happened today?",
      draft: worker.text,
    });
    const finalText = identityFirewall(review.final);

    assertScrubbed(finalText);
    expect(review.audit).toMatch(/Reasoning Audit/);
    expect(research.audit.audit).toMatch(/privacy\.ts/i);

    // No third-party model provider may ever be contacted.
    for (const url of contacted) {
      expect(url).not.toMatch(/huggingface|openai|anthropic|googleapis|openrouter/i);
    }
  });
});
