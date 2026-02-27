import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export type ExtractedArticle = {
  content_html: string;
  content_text: string;
  excerpt: string;
  byline: string;
  word_count: number;
  source: "readability" | "archive.ph";
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
    const archiveUrl = `https://archive.ph/newest/${encodeURI(url)}`;
    const res = await fetch(archiveUrl, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    return parseWithReadability(html, url);
  } catch {
    return null;
  }
}

function parseWithReadability(
  html: string,
  url: string,
): Omit<ExtractedArticle, "source"> | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) return null;

    const textContent = (article.textContent ?? "").trim();

    return {
      content_html: article.content ?? "",
      content_text: textContent,
      excerpt: article.excerpt ?? textContent.slice(0, 280),
      byline: article.byline ?? "",
      word_count: textContent.split(/\s+/).length,
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
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

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

// For manual "try archive.ph" button — forces archive.ph regardless
export async function extractViaArchive(
  url: string,
): Promise<ExtractedArticle | null> {
  const result = await tryArchivePh(url);
  if (!result) return null;
  return { ...result, source: "archive.ph" };
}
