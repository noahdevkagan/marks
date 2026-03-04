import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export type ExtractedArticle = {
  content_html: string;
  content_text: string;
  excerpt: string;
  byline: string;
  word_count: number;
  source: "readability" | "archive.ph" | "wayback";
};

const MIN_CONTENT_LENGTH = 200;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

async function tryArchivePh(
  url: string,
): Promise<Omit<ExtractedArticle, "source"> | null> {
  try {
    // archive.ph/newest/<url> redirects to the most recent snapshot
    // Short timeout — archive.ph usually returns CAPTCHA (429) for server-side requests
    const archiveUrl = `https://archive.ph/newest/${encodeURI(url)}`;
    const res = await fetch(archiveUrl, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    return parseWithReadability(html, url);
  } catch {
    return null;
  }
}

async function tryWaybackMachine(
  url: string,
): Promise<Omit<ExtractedArticle, "source"> | null> {
  try {
    // web.archive.org/web/2/<url> redirects to the most recent snapshot
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

    return {
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

  return null;
}
