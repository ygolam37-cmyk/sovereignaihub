// DuckDuckGo HTML scraper - no API key required.
// Uses the lightweight html.duckduckgo.com endpoint.

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const DDG_URL = "https://html.duckduckgo.com/html/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function unwrapDdgRedirect(href: string): string {
  // DDG wraps results like /l/?uddg=<encoded>&...
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

export async function searchDuckDuckGo(
  query: string,
  limit = 5,
  timeoutMs = 6000,
): Promise<SearchHit[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(DDG_URL, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
      },
      body: new URLSearchParams({ q: query, kl: "wt-wt" }).toString(),
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const html = await res.text();

    const hits: SearchHit[] = [];
    const resultRe =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = resultRe.exec(html)) && hits.length < limit) {
      const url = unwrapDdgRedirect(m[1]);
      const title = stripTags(m[2]);
      const snippet = stripTags(m[3]);
      if (url && title) hits.push({ title, url, snippet });
    }
    return hits;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
