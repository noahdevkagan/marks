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
  "best", "top", "most", "very", "like", "some", "any", "each", "every",
  "first", "last", "next", "back", "here", "there", "where", "while",
  "these", "those", "such", "other", "many", "much", "even", "still",
  "well", "way", "part", "per", "via", "etc", "see", "end", "let",
  "say", "said", "make", "made", "take", "come", "know", "think",
  "look", "want", "give", "day", "good", "year", "right", "too",
  "own", "same", "tell", "need", "home", "big", "high", "long",
  "page", "site", "web", "blog", "post", "article", "read", "click",
  "share", "follow", "sign", "free", "view", "index", "main", "amp",
  "los", "las", "san", "del", "mod", "ref", "pos", "utm",
  "content", "subscribe", "login", "register", "account", "premium",
  "newsletter", "cookie", "cookies", "privacy", "terms", "policy",
]);

/** Check if a keyword is a stop word (handles multi-word meta keywords) */
function isStopWord(keyword: string): boolean {
  if (!keyword.includes(" ")) return STOP_WORDS.has(keyword);
  const words = keyword.split(/\s+/);
  return words.every((w) => STOP_WORDS.has(w) || w.length <= 2);
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function suggestTags(
  url: string,
  userTags?: string[],
): Promise<string[]> {
  // Extract page metadata for AI context (and as fallback)
  let title = "";
  let description = "";
  const candidates = new Map<string, number>();

  addUrlKeywords(url, candidates);

  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const html = await res.text();
      addMetaKeywords(html, candidates);
      title = extractTitle(html);
      description = extractDescription(html);
    }
  } catch {
    // If fetch fails, we still have URL-based suggestions
  }

  // Try AI-powered suggestions first
  try {
    const { suggestBookmarkTags } = await import("@/lib/ai");
    const aiTags = await suggestBookmarkTags(
      url,
      title,
      description,
      userTags ?? [],
    );
    if (aiTags.length > 0) return aiTags.slice(0, 5);
  } catch {
    // AI unavailable (no API key, network error, etc.) — fall back to pattern matching
  }

  // Fallback: pattern-matching approach
  // Boost candidates that exactly match user's existing tags
  if (userTags?.length) {
    const userTagSet = new Set(userTags.map((t) => t.toLowerCase()));
    for (const [tag, score] of candidates) {
      if (userTagSet.has(tag)) {
        candidates.set(tag, score + 10);
      }
    }
  }

  // Filter out low-confidence candidates (score <= 2 means only URL-fragment match)
  const MIN_SCORE = 3;

  // Sort by score and return top results
  const sorted = [...candidates.entries()]
    .filter(([, score]) => score >= MIN_SCORE)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // Deduplicate: remove single-word tags that are part of a higher-ranked multi-word tag
  const results: string[] = [];
  for (const tag of sorted) {
    if (results.length >= 5) break;
    const isPartOfExisting = results.some(
      (existing) => existing.includes(" ") && existing.includes(tag),
    );
    if (!isPartOfExisting) {
      results.push(tag);
    }
  }

  return results;
}

/** Build candidates from URL alone (no fetch needed). Exported for testing. */
export function suggestTagsFromUrl(url: string): string[] {
  const candidates = new Map<string, number>();
  addUrlKeywords(url, candidates);
  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
}

/** Build candidates from URL + raw HTML. Exported for testing. */
export function suggestTagsFromHtml(url: string, html: string): string[] {
  const candidates = new Map<string, number>();
  addUrlKeywords(url, candidates);
  addMetaKeywords(html, candidates);
  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
}

/** Extract best title from HTML for AI context */
function extractTitle(html: string): string {
  return (
    getTitle(html) ||
    getMetaContent(html, "property", "og:title") ||
    ""
  );
}

/** Extract best description from HTML for AI context */
function extractDescription(html: string): string {
  return (
    getMetaContent(html, "name", "description") ||
    getMetaContent(html, "property", "og:description") ||
    ""
  );
}

export function addUrlKeywords(url: string, candidates: Map<string, number>) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    const domainParts = host.split(".");
    for (const part of domainParts) {
      if (part.length > 2 && !STOP_WORDS.has(part)) {
        candidates.set(part, (candidates.get(part) ?? 0) + 3);
      }
    }

    // Split path into segments by /
    const segments = parsed.pathname
      .split("/")
      .map((s) => s.toLowerCase().trim())
      .filter(
        (s) =>
          s.length > 0 &&
          !/^[a-f0-9]{8,}$/.test(s) && // skip hex hashes
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s), // skip UUIDs
      );

    for (const segment of segments) {
      // Keep short hyphenated segments as multi-word phrases (e.g., "real-estate" → "real estate")
      if (segment.includes("-")) {
        const parts = segment.split("-").filter((w) => w.length > 0 && !/^\d+$/.test(w) && !/^[a-f0-9]{6,}$/.test(w));
        // Only create phrases from 2-3 word segments (natural tag length)
        if (parts.length >= 2 && parts.length <= 3) {
          const phrase = parts.join(" ");
          if (phrase.length > 2 && !isStopWord(phrase)) {
            candidates.set(phrase, (candidates.get(phrase) ?? 0) + 4);
          }
        }
      }

      // Also add individual words from each segment
      const words = segment
        .split(/[-_.]/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w) && !/^[a-f0-9]{6,}$/.test(w));

      for (const word of words) {
        candidates.set(word, (candidates.get(word) ?? 0) + 2);
      }
    }
  } catch {
    // Invalid URL, skip
  }
}

/** Extract a meta tag attribute using regex (no DOM parser needed) */
function getMetaContent(html: string, attr: string, value: string): string | null {
  // Match both orders: name="x" content="y" and content="y" name="x"
  const pattern1 = new RegExp(
    `<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const pattern2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${value}["']`,
    "i",
  );
  return pattern1.exec(html)?.[1] ?? pattern2.exec(html)?.[1] ?? null;
}

/** Extract all meta tags with a given property (e.g., article:tag) */
function getAllMetaContent(html: string, attr: string, value: string): string[] {
  const results: string[] = [];
  const pattern = new RegExp(
    `<meta[^>]+(?:${attr}=["']${value}["'][^>]+content=["']([^"']*)["']|content=["']([^"']*)["'][^>]+${attr}=["']${value}["'])`,
    "gi",
  );
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const content = match[1] ?? match[2];
    if (content) results.push(content);
  }
  return results;
}

/** Extract title text from <title> tag */
function getTitle(html: string): string {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return match?.[1]?.trim() ?? "";
}

export function addMetaKeywords(
  html: string,
  candidates: Map<string, number>,
) {
  try {
    // Meta keywords tag
    const metaKeywords = getMetaContent(html, "name", "keywords");
    if (metaKeywords) {
      const keywords = metaKeywords
        .split(",")
        .map((k) => k.toLowerCase().trim())
        .filter((k) => k.length > 1 && k.length <= 30 && !isStopWord(k));
      for (const kw of keywords.slice(0, 10)) {
        candidates.set(kw, (candidates.get(kw) ?? 0) + 5);
      }
    }

    // OG tags (article:tag)
    const ogTags = getAllMetaContent(html, "property", "article:tag");
    for (const tagContent of ogTags) {
      const tag = tagContent.toLowerCase().trim();
      if (tag && tag.length > 1 && tag.length <= 30 && !isStopWord(tag)) {
        candidates.set(tag, (candidates.get(tag) ?? 0) + 5);
      }
    }

    // Title keywords
    const title =
      getTitle(html) ||
      getMetaContent(html, "property", "og:title") ||
      "";
    addTextKeywords(title, candidates, 2);

    // Description keywords
    const description =
      getMetaContent(html, "name", "description") ||
      getMetaContent(html, "property", "og:description") ||
      "";
    addTextKeywords(description, candidates, 1);
  } catch {
    // Parse error, skip
  }
}

export function addTextKeywords(
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

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  for (const [word, count] of topWords) {
    candidates.set(word, (candidates.get(word) ?? 0) + weight * count);
  }
}
