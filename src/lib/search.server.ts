// Zero-API, multi-engine open-source search with raw RSS/HTML fallbacks.
// No API keys. Rotates strategies until one returns hits.

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string; // ISO when available (RSS/news)
  source?: string;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------- helpers ----------
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
function unwrapDdgRedirect(href: string): string {
  try {
    if (href.startsWith("//")) href = "https:" + href;
    const u = new URL(href, "https://duckduckgo.com");
    const target = u.searchParams.get("uddg");
    if (target) return decodeURIComponent(target);
    return href;
  } catch {
    return href;
  }
}
function unwrapGoogleNewsRedirect(href: string): string {
  try {
    const u = new URL(href, "https://news.google.com");
    const target = u.searchParams.get("url");
    return target ? decodeURIComponent(target) : href;
  } catch {
    return href;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response | null> {
  const { timeoutMs = 6000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(rest.headers ?? {}),
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------- cache ----------
type CacheEntry = { hits: SearchHit[]; expiresAt: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_MAX = 200;
const FRESH_INTENT =
  /\b(today|tonight|now|current|latest|news|breaking|live|price|stock|score|weather)\b/i;
function ttlFor(query: string): number {
  if (FRESH_INTENT.test(query)) return 60_000;
  if (/\b(20\d{2})\b/.test(query)) return 5 * 60_000;
  return 30 * 60_000;
}
function cacheKey(q: string, limit: number) {
  return `${limit}:${q.trim().toLowerCase().replace(/\s+/g, " ")}`;
}
function readCache(key: string): SearchHit[] | null {
  const e = CACHE.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    CACHE.delete(key);
    return null;
  }
  CACHE.delete(key);
  CACHE.set(key, e);
  return e.hits;
}
function writeCache(key: string, hits: SearchHit[], ttlMs: number) {
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, { hits, expiresAt: Date.now() + ttlMs });
}

// ---------- engines ----------
async function searchDDG(query: string, limit: number): Promise<SearchHit[]> {
  const res = await fetchWithTimeout("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ q: query, kl: "wt-wt" }).toString(),
  });
  if (!res || !res.ok) return [];
  const html = await res.text();
  const hits: SearchHit[] = [];
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < limit) {
    const url = unwrapDdgRedirect(m[1]);
    const title = stripTags(m[2]);
    const snippet = stripTags(m[3]);
    if (url && title) hits.push({ title, url, snippet, source: "duckduckgo" });
  }
  return hits;
}

async function searchBingHTML(query: string, limit: number): Promise<SearchHit[]> {
  const res = await fetchWithTimeout(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&form=QBLH`,
  );
  if (!res || !res.ok) return [];
  const html = await res.text();
  const hits: SearchHit[] = [];
  const re =
    /<li class="b_algo"[^>]*>[\s\S]*?<h2>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < limit) {
    const url = m[1];
    const title = stripTags(m[2]);
    const snippet = stripTags(m[3]);
    if (url && title) hits.push({ title, url, snippet, source: "bing" });
  }
  return hits;
}

async function searchBraveHTML(query: string, limit: number): Promise<SearchHit[]> {
  const res = await fetchWithTimeout(
    `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`,
  );
  if (!res || !res.ok) return [];
  const html = await res.text();
  const hits: SearchHit[] = [];
  // Brave result anchors
  const re =
    /<a[^>]*class="[^"]*result-header[^"]*"[^>]*href="([^"]+)"[\s\S]*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<div[^>]*class="[^"]*snippet-description[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < limit) {
    const url = m[1];
    const title = stripTags(m[2]);
    const snippet = stripTags(m[3]);
    if (url && title) hits.push({ title, url, snippet, source: "brave" });
  }
  return hits;
}

// ---------- RSS news fallback (real-time, sorted by date) ----------
function parseRss(xml: string, limit: number, source: string): SearchHit[] {
  const items: SearchHit[] = [];
  const itemRe = /<item[\s>][\s\S]*?<\/item>/g;
  const itemMatches = xml.match(itemRe) ?? [];
  for (const it of itemMatches) {
    if (items.length >= limit) break;
    const title = stripTags((/<title[^>]*>([\s\S]*?)<\/title>/.exec(it)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, ""));
    const linkRaw = (/<link[^>]*>([\s\S]*?)<\/link>/.exec(it)?.[1] ?? "").trim();
    const url = unwrapGoogleNewsRedirect(stripTags(linkRaw));
    const desc = stripTags((/<description[^>]*>([\s\S]*?)<\/description>/.exec(it)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, ""));
    const pub = (/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/.exec(it)?.[1] ?? "").trim();
    let iso: string | undefined;
    if (pub) {
      const d = new Date(pub);
      if (!isNaN(d.getTime())) iso = d.toISOString();
    }
    if (url && title) items.push({ title, url, snippet: desc, publishedAt: iso, source });
  }
  return items;
}

async function searchGoogleNewsRSS(query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return [];
  return parseRss(await res.text(), limit, "google-news");
}

async function searchBingNewsRSS(query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return [];
  return parseRss(await res.text(), limit, "bing-news");
}

// ---------- orchestrator ----------
function dedupe(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const k = h.url.replace(/[#?].*$/, "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

function sortByRecency(hits: SearchHit[]): SearchHit[] {
  return hits.slice().sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
}

export async function searchDuckDuckGo(
  query: string,
  limit = 5,
  _timeoutMs = 6000,
): Promise<SearchHit[]> {
  // Name kept for back-compat; this is now a multi-engine open-source search.
  const key = cacheKey(query, limit);
  const cached = readCache(key);
  if (cached) return cached;

  const isNews = FRESH_INTENT.test(query);
  // Time-aware query augmentation so engines bias to "now"
  const stamped = isNews ? `${query} ${new Date().toISOString().slice(0, 10)}` : query;

  // Strategy rotation. News → RSS first (has timestamps), then HTML engines.
  const strategies: Array<() => Promise<SearchHit[]>> = isNews
    ? [
        () => searchGoogleNewsRSS(stamped, limit),
        () => searchBingNewsRSS(stamped, limit),
        () => searchDDG(stamped, limit),
        () => searchBingHTML(stamped, limit),
        () => searchBraveHTML(stamped, limit),
      ]
    : [
        () => searchDDG(stamped, limit),
        () => searchBingHTML(stamped, limit),
        () => searchBraveHTML(stamped, limit),
        () => searchGoogleNewsRSS(stamped, limit),
      ];

  let collected: SearchHit[] = [];
  for (const run of strategies) {
    try {
      const hits = await run();
      if (hits.length) {
        collected = collected.concat(hits);
        if (collected.length >= limit) break;
      }
    } catch {
      // rotate to next strategy
    }
  }

  let final = dedupe(collected);
  if (isNews) final = sortByRecency(final);
  final = final.slice(0, limit);

  if (final.length) writeCache(key, final, ttlFor(query));
  return final;
}
