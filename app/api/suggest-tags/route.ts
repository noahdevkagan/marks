import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { JSDOM } from "jsdom";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// Common stop words to filter out
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "is", "it", "as", "be", "was", "are", "been", "from", "has",
  "have", "had", "not", "this", "that", "which", "who", "will", "can", "more",
  "when", "what", "how", "all", "if", "no", "do", "so", "up", "out", "about",
  "than", "into", "over", "just", "your", "you", "we", "our", "my", "me",
  "its", "his", "her", "he", "she", "they", "them", "their", "would", "could",
  "should", "may", "might", "must", "shall", "also", "only", "then", "after",
  "before", "new", "one", "two", "get", "got", "use", "used", "using",
  "www", "com", "org", "net", "http", "https", "html", "htm", "php", "asp",
]);

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = req.nextUrl.searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    const tags = await suggestTags(url);
    return NextResponse.json({ tags });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

async function suggestTags(url: string): Promise<string[]> {
  const candidates = new Map<string, number>();

  // Extract keywords from URL structure
  addUrlKeywords(url, candidates);

  // Fetch page and extract metadata keywords
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const html = await res.text();
      addMetaKeywords(html, url, candidates);
    }
  } catch {
    // If fetch fails, we still have URL-based suggestions
  }

  // Sort by score and return top 3
  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
}

function addUrlKeywords(url: string, candidates: Map<string, number>) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    // Domain name (e.g., "github" from "github.com")
    const domainParts = host.split(".");
    for (const part of domainParts) {
      if (part.length > 2 && !STOP_WORDS.has(part)) {
        candidates.set(part, (candidates.get(part) ?? 0) + 3);
      }
    }

    // Path segments (e.g., "/blog/javascript-tips" → "blog", "javascript", "tips")
    const pathParts = parsed.pathname
      .split(/[/\-_.]/)
      .map((s) => s.toLowerCase().trim())
      .filter((s) => s.length > 2 && !STOP_WORDS.has(s) && !/^\d+$/.test(s));

    for (const part of pathParts) {
      candidates.set(part, (candidates.get(part) ?? 0) + 2);
    }
  } catch {
    // Invalid URL, skip
  }
}

function addMetaKeywords(
  html: string,
  url: string,
  candidates: Map<string, number>,
) {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // Meta keywords tag
    const metaKeywords = doc
      .querySelector('meta[name="keywords"]')
      ?.getAttribute("content");
    if (metaKeywords) {
      const keywords = metaKeywords
        .split(",")
        .map((k) => k.toLowerCase().trim())
        .filter((k) => k.length > 1 && k.length <= 30);
      for (const kw of keywords.slice(0, 10)) {
        candidates.set(kw, (candidates.get(kw) ?? 0) + 5);
      }
    }

    // OG tags (article:tag)
    const ogTags = doc.querySelectorAll('meta[property="article:tag"]');
    for (const el of ogTags) {
      const tag = el.getAttribute("content")?.toLowerCase().trim();
      if (tag && tag.length > 1 && tag.length <= 30) {
        candidates.set(tag, (candidates.get(tag) ?? 0) + 5);
      }
    }

    // Title keywords
    const title =
      doc.querySelector("title")?.textContent ??
      doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ??
      "";
    addTextKeywords(title, candidates, 2);

    // Description keywords
    const description =
      doc
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") ??
      doc
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content") ??
      "";
    addTextKeywords(description, candidates, 1);
  } catch {
    // Parse error, skip
  }
}

function addTextKeywords(
  text: string,
  candidates: Map<string, number>,
  weight: number,
) {
  if (!text) return;

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  // Count word frequency in this text
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  // Add top words by frequency
  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  for (const [word, count] of topWords) {
    candidates.set(word, (candidates.get(word) ?? 0) + weight * count);
  }
}
