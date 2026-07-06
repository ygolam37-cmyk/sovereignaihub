import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchOpenSource } from "./search.server";

// Every engine returns payloads riddled with PII. We assert that after
// researchOpenSource runs, no title or snippet contains any identifier.

const PII_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // email
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // aadhaar
  /\b\d{3}-\d{2}-\d{4}\b/, // ssn
  /\+?\d[\d\s().-]{7,}\d/, // phone
  /\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|Ave|Avenue|Road|Rd|Blvd|Lane|Drive|Dr)\b/, // address
];

function assertScrubbed(text: string) {
  for (const re of PII_PATTERNS) {
    expect(text, `leaked via pattern ${re}`).not.toMatch(re);
  }
}

const POISONED_TITLE =
  "Contact john.doe@example.com — Aadhaar 1234 5678 9012 exposed";
const POISONED_SNIPPET =
  "Call +1 415-555-0142 or write to 221 Baker Street. SSN 123-45-6789. Card 4111 1111 1111 1111.";

function htmlResponse(body: string) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}
function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// Minimal HTML shells matching each engine's parser.
function ddgHtml() {
  return `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(
    "https://a.example.com/1",
  )}">${POISONED_TITLE}</a><a class="result__snippet">${POISONED_SNIPPET}</a>`;
}
function bingHtml() {
  return `<li class="b_algo"><h2><a href="https://b.example.com/1">${POISONED_TITLE}</a></h2><p>${POISONED_SNIPPET}</p></li>`;
}
function braveHtml() {
  return `<a class="result-header" href="https://c.example.com/1"><span class="title">${POISONED_TITLE}</span></a><div class="snippet-description">${POISONED_SNIPPET}</div>`;
}
function whoogleHtml() {
  return `<a href="https://d.example.com/1"><h3>${POISONED_TITLE}</h3></a><span>${POISONED_SNIPPET}</span>`;
}
function newsRss() {
  return `<?xml version="1.0"?><rss><channel><item><title>${POISONED_TITLE}</title><link>https://e.example.com/1</link><description>${POISONED_SNIPPET}</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
}

describe("researchOpenSource privacy firewall", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("format=json")) {
          // SearXNG JSON
          return jsonResponse({
            results: [
              {
                title: POISONED_TITLE,
                url: "https://searx.example.com/1",
                content: POISONED_SNIPPET,
              },
            ],
          });
        }
        if (url.includes("duckduckgo.com")) return htmlResponse(ddgHtml());
        if (url.includes("bing.com/news")) return htmlResponse(newsRss());
        if (url.includes("bing.com")) return htmlResponse(bingHtml());
        if (url.includes("brave.com")) return htmlResponse(braveHtml());
        if (url.includes("whoogle") || url.includes("albony")) return htmlResponse(whoogleHtml());
        if (url.includes("news.google.com")) return htmlResponse(newsRss());
        return new Response("", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("scrubs PII from every hit title and snippet", async () => {
    const { hits, audit } = await researchOpenSource("latest news", 5);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      assertScrubbed(h.title);
      assertScrubbed(h.snippet);
    }
    // Audit must mention the privacy firewall
    expect(audit.audit).toMatch(/privacy\.ts/i);
  });

  it("still scrubs when only one engine responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("duckduckgo.com")) return htmlResponse(ddgHtml());
        return new Response("", { status: 500 });
      }),
    );
    const { hits } = await researchOpenSource("solo engine query", 3);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      assertScrubbed(h.title);
      assertScrubbed(h.snippet);
    }
  });

  it("returns clean placeholder tokens for scrubbed identifiers", async () => {
    const { hits } = await researchOpenSource("privacy check", 3);
    const joined = hits.map((h) => `${h.title} ${h.snippet}`).join(" ");
    // At least one redaction token should appear, proving scrubbing ran.
    expect(joined).toMatch(/\[(email|id|phone|address|ssn|card)\]/);
  });
});
