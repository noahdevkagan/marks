import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export type ExtractedArticle = {
  title: string;
  content_html: string;
  content_text: string;
  excerpt: string;
  byline: string;
  word_count: number;
  source: "readability" | "archive.ph" | "wayback" | "jina";
};

const MIN_CONTENT_LENGTH = 200;

// Bot walls (Bloomberg, Cloudflare, PerimeterX, …) often return HTTP 200 with
// enough text to pass MIN_CONTENT_LENGTH, which short-circuits the fallback
// chain and archives the CAPTCHA page as article content. Real block pages are
// short, so the length guard keeps articles that merely mention these phrases
// from being rejected.
const BLOCK_PAGE_MAX_LENGTH = 4000;
const BLOCK_PAGE_PATTERNS = [
  /detected unusual activity/i, // Bloomberg
  /are you a robot/i, // Bloomberg <title>
  /not a robot/i, // reCAPTCHA prompts
  /verify(?:ing)? (?:that )?you are (?:a )?human/i, // Cloudflare Turnstile
  /checking your browser before accessing/i, // Cloudflare
  /just a moment\.\.\./i, // Cloudflare <title>
  /attention required!/i, // Cloudflare <title>
  /access to this page has been denied/i, // PerimeterX
  /pardon our interruption/i, // Imperva/Distil
  /please complete the security check/i,
  /one more step/i, // archive.today reCAPTCHA interstitial heading
  /enable javascript and cookies to continue/i,
];

function isBlockPage(title: string, text: string): boolean {
  if (text.length > BLOCK_PAGE_MAX_LENGTH) return false;
  const haystack = `${title} ${text.slice(0, 2000)}`;
  return BLOCK_PAGE_PATTERNS.some((re) => re.test(haystack));
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

export async function extractArticle(
  url: string,
): Promise<ExtractedArticle | null> {
  // Step 1: try direct extraction with Readability
  const direct = await tryReadability(url);

  if (direct && direct.content_text.length >= MIN_CONTENT_LENGTH) {
    return { ...direct, source: "readability" };
  }

  // Step 2: fall back to archive.ph for paywalled/thin content
  const archived = await tryArchivePh(url);

  if (archived && archived.content_text.length >= MIN_CONTENT_LENGTH) {
    return { ...archived, source: "archive.ph" };
  }

  // Step 3: fall back to Wayback Machine
  const wayback = await tryWaybackMachine(url);

  if (wayback && wayback.content_text.length >= MIN_CONTENT_LENGTH) {
    return { ...wayback, source: "wayback" };
  }

  // Step 4: fall back to Jina reader (renders JS, gets past most bot walls)
  const jina = await tryJinaReader(url);

  if (jina && jina.content_text.length >= MIN_CONTENT_LENGTH) {
    return { ...jina, source: "jina" };
  }

  // Return whatever we got (direct may have partial content), or null
  return direct ? { ...direct, source: "readability" } : null;
}

async function tryReadability(
  url: string,
): Promise<Omit<ExtractedArticle, "source"> | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    return parseWithReadability(html, url);
  } catch {
    return null;
  }
}

// archive.today rotates across these mirror domains; they share one backend.
// Different frontends sit behind the reCAPTCHA independently, so trying more
// than one raises the odds of reaching a snapshot without a challenge.
const ARCHIVE_HOSTS = ["archive.ph", "archive.today", "archive.is"];

// Resolve an *existing* snapshot's direct short URL (e.g. https://archive.is/XwDGC)
// via the Memento TimeMap. The TimeMap is a machine-facing endpoint
// (`/timemap/<url>`) that returns snapshot URLs as text/plain and is usually
// NOT behind the interactive "One more step" reCAPTCHA that the HTML
// `/newest/` *submit* flow triggers. Fetching a known snapshot skips the
// capture request that provokes a fresh challenge.
async function resolveArchiveSnapshot(url: string): Promise<string | null> {
  for (const host of ARCHIVE_HOSTS) {
    try {
      const res = await fetch(`https://${host}/timemap/${encodeURI(url)}`, {
        headers: FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;

      const body = await res.text();
      // Lines look like:
      //   <https://archive.ph/XwDGC>; rel="memento"; datetime="Wed, 16 Jul 2026 ..."
      const mementos = [
        ...body.matchAll(
          /<(https?:\/\/[^>]+)>\s*;[^,]*rel="[^"]*memento[^"]*"[^,]*datetime="([^"]+)"/gi,
        ),
      ]
        .map((m) => ({ url: m[1], time: Date.parse(m[2]) || 0 }))
        .filter((m) => m.url);

      if (mementos.length === 0) continue;

      // Newest snapshot first
      mementos.sort((a, b) => b.time - a.time);
      return mementos[0].url;
    } catch {
      // try the next mirror
    }
  }
  return null;
}

async function tryArchivePh(
  url: string,
): Promise<Omit<ExtractedArticle, "source"> | null> {
  // Prefer an existing snapshot resolved via Memento — fetching a known
  // short URL avoids the /newest/ submit flow that provokes the reCAPTCHA.
  // Fall back to /newest/ (the fresh-capture path, often challenged for
  // server-side/datacenter IPs) only if no snapshot is on record.
  const snapshot = await resolveArchiveSnapshot(url);
  const candidates = [
    ...(snapshot ? [snapshot] : []),
    `https://archive.ph/newest/${encodeURI(url)}`,
  ];

  for (const archiveUrl of candidates) {
    try {
      const res = await fetch(archiveUrl, {
        headers: FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;

      const html = await res.text();
      // parseWithReadability rejects challenge/block pages via isBlockPage,
      // so a captured "One more step" page returns null and we try the next.
      const parsed = parseWithReadability(html, url);
      if (parsed && parsed.content_text.length >= MIN_CONTENT_LENGTH) {
        return parsed;
      }
    } catch {
      // try the next candidate
    }
  }

  return null;
}

async function tryWaybackMachine(
  url: string,
): Promise<Omit<ExtractedArticle, "source"> | null> {
  // The naive /web/2/<url> redirect picks the newest snapshot regardless of
  // status — often a captured 403/bot-block page. Ask the CDX API for
  // snapshots that returned 200 and try the most recent ones.
  const timestamps = await waybackSnapshots(url);

  for (const ts of timestamps) {
    try {
      // id_ flag serves the raw original HTML (no toolbar, no URL rewriting)
      const snapshotUrl = `https://web.archive.org/web/${ts}id_/${encodeURI(url)}`;
      const res = await fetch(snapshotUrl, {
        headers: FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) continue;

      const html = await res.text();
      const parsed = parseWithReadability(html, url);
      if (parsed && parsed.content_text.length >= MIN_CONTENT_LENGTH) {
        return parsed;
      }
    } catch {
      // try the next snapshot
    }
  }

  // CDX unavailable or no usable snapshot — fall back to the redirect endpoint
  try {
    const waybackUrl = `https://web.archive.org/web/2/${encodeURI(url)}`;
    const res = await fetch(waybackUrl, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return null;

    let html = await res.text();

    // Strip Wayback Machine's injected toolbar
    html = html.replace(
      /<!-- BEGIN WAYBACK TOOLBAR INSERT -->[\s\S]*?<!-- END WAYBACK TOOLBAR INSERT -->/,
      "",
    );

    return parseWithReadability(html, url);
  } catch {
    return null;
  }
}

// Newest-first timestamps of snapshots that captured an HTTP 200 response
async function waybackSnapshots(url: string): Promise<string[]> {
  try {
    // limit=-3 returns the 3 most recent matches
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&filter=statuscode:200&fl=timestamp&limit=-3`;
    const res = await fetch(cdxUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const rows = (await res.json()) as string[][];
    // First row is the header (["timestamp"]); newest last
    return rows
      .slice(1)
      .map((row) => row[0])
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

async function tryJinaReader(
  url: string,
): Promise<Omit<ExtractedArticle, "source"> | null> {
  try {
    // r.jina.ai renders the page in a headless browser — gets past bot walls
    // that block plain fetches. Free tier is rate-limited; JINA_API_KEY
    // (optional) raises the limit.
    const headers: Record<string, string> = {
      "X-Respond-With": "html",
    };
    if (process.env.JINA_API_KEY) {
      headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
    }

    const res = await fetch(`https://r.jina.ai/${encodeURI(url)}`, {
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    return parseWithReadability(html, url);
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWithReadability(
  html: string,
  url: string,
): Omit<ExtractedArticle, "source"> | null {
  try {
    const { document } = parseHTML(html);

    // LinkedIn: strip reactions, comments, and social proof sections before Readability
    if (/linkedin\.com/.test(url)) {
      const selectors = [
        '.social-details-social-counts',
        '.social-details-social-activity',
        '[data-ad-preview="social-counts"]',
        '.comments-comments-list',
        '.comments-comment-item',
        '.reactions-react-button',
        '.feed-shared-social-action-bar',
        '.feed-shared-social-counts',
      ];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) el.remove();
      }
      // Remove any element whose only text is "Reactions", "Comments", or "Activity"
      // and all following siblings (these are section dividers on LinkedIn)
      const allEls = Array.from(document.querySelectorAll('*'));
      const stopWords = ["reactions", "comments", "activity"];
      for (const el of allEls) {
        const text = (el.textContent || "").trim().toLowerCase();
        if (stopWords.includes(text) && el.children.length <= 1) {
          // Remove this element and all subsequent siblings
          let node: ChildNode | null = el as unknown as ChildNode;
          const parent = node.parentNode;
          if (parent) {
            while (node) {
              const next: ChildNode | null = node.nextSibling;
              parent.removeChild(node);
              node = next;
            }
          }
        }
      }
    }

    // Set documentURI for Readability (it uses this for relative URL resolution)
    Object.defineProperty(document, "documentURI", {
      value: url,
      writable: false,
    });

    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();

    if (!article || !article.content) return null;

    // linkedom's textContent is unreliable, so derive text from HTML
    const textContent = stripHtml(article.content);

    if (isBlockPage(article.title ?? "", textContent)) return null;

    return {
      title: article.title ?? "",
      content_html: article.content,
      content_text: textContent,
      excerpt: article.excerpt ?? textContent.slice(0, 280),
      byline: article.byline ?? "",
      word_count: textContent.split(/\s+/).filter(Boolean).length,
    };
  } catch {
    return null;
  }
}

export type PageMetadata = {
  title: string;
  description: string;
  keywords: string;
};

export async function extractMetadata(url: string): Promise<PageMetadata> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { title: "", description: "", keywords: "" };

    const html = await res.text();
    const { document: doc } = parseHTML(html);

    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    const titleEl = doc.querySelector("title")?.textContent;
    const title = (ogTitle || titleEl || "").trim();

    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute("content");
    const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content");
    const description = (ogDesc || metaDesc || "").trim();

    const keywords = doc.querySelector('meta[name="keywords"]')?.getAttribute("content") || "";

    // Don't save a bot wall's title/description as bookmark metadata
    if (isBlockPage(title, description)) {
      return { title: "", description: "", keywords: "" };
    }

    return { title, description, keywords };
  } catch {
    return { title: "", description: "", keywords: "" };
  }
}

// Parse pre-fetched HTML (e.g. from Chrome extension capturing the page)
export function extractFromHtml(
  html: string,
  url: string,
): ExtractedArticle | null {
  const result = parseWithReadability(html, url);
  if (!result || result.content_text.length < MIN_CONTENT_LENGTH) return null;
  return { ...result, source: "readability" };
}

// Extract OG/media URLs from HTML for storage
export function extractMediaUrls(html: string): {
  ogImage: string | null;
  ogVideo: string | null;
  images: string[];
} {
  try {
    const { document: doc } = parseHTML(html);

    const ogImage =
      doc
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content") ?? null;

    const ogVideo =
      doc
        .querySelector('meta[property="og:video"]')
        ?.getAttribute("content") ?? null;

    const images: string[] = [];
    const imgEls = doc.querySelectorAll("img[src]");
    for (const img of imgEls) {
      const src = img.getAttribute("src");
      if (!src) continue;
      // Skip tracking pixels and tiny images
      const width = parseInt(img.getAttribute("width") ?? "0", 10);
      const height = parseInt(img.getAttribute("height") ?? "0", 10);
      if ((width > 0 && width < 50) || (height > 0 && height < 50)) continue;
      if (src.includes("pixel") || src.includes("tracking") || src.includes("1x1")) continue;
      images.push(src);
    }

    return { ogImage, ogVideo, images: images.slice(0, 10) };
  } catch {
    return { ogImage: null, ogVideo: null, images: [] };
  }
}

// For manual "try archive" button — tries archive.ph, then Wayback Machine
export async function extractViaArchive(
  url: string,
): Promise<ExtractedArticle | null> {
  const archiveResult = await tryArchivePh(url);
  if (archiveResult && archiveResult.content_text.length >= MIN_CONTENT_LENGTH) {
    return { ...archiveResult, source: "archive.ph" };
  }

  const waybackResult = await tryWaybackMachine(url);
  if (waybackResult && waybackResult.content_text.length >= MIN_CONTENT_LENGTH) {
    return { ...waybackResult, source: "wayback" };
  }

  const jinaResult = await tryJinaReader(url);
  if (jinaResult && jinaResult.content_text.length >= MIN_CONTENT_LENGTH) {
    return { ...jinaResult, source: "jina" };
  }

  return null;
}
