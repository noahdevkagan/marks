export async function fetchTweetOembed(url: string): Promise<{
  text: string;
  author: string;
  authorUrl: string;
} | null> {
  try {
    const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();

    // Extract tweet text from the html field (blockquote content)
    const text = (data.html as string)
      .replace(/^[\s\S]*?<blockquote[^>]*><p[^>]*>/, "")
      .replace(/<\/p>[\s\S]*$/, "")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<a[^>]*>(.*?)<\/a>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    return {
      text,
      author: data.author_name ?? "",
      authorUrl: data.author_url ?? "",
    };
  } catch {
    return null;
  }
}

/** Check if a string is essentially just a URL (with optional surrounding whitespace) */
export function isJustUrl(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(https?:\/\/\S+)$/);
  return match ? match[1] : null;
}

/**
 * For tweets whose text is just a link (e.g. a t.co URL pointing to an X article),
 * fetch the tweet page with a bot UA to get the og:description, which X populates
 * with the linked article's title. Uses curl with HTTP/1.1 because X serves
 * og:description to bots only over HTTP/1.1 (HTTP/2 gets the SPA shell).
 * Returns null if unable to resolve.
 */
export async function resolveTweetLinkTitle(
  tweetText: string,
  tweetUrl: string,
): Promise<string | null> {
  if (!isJustUrl(tweetText)) return null;

  try {
    const { execSync } = await import("child_process");
    const html = execSync(
      `curl -sL --http1.1 -H "User-Agent: Googlebot/2.1" -H "Accept: text/html" "${tweetUrl}"`,
      { timeout: 10000 },
    ).toString();

    // Match both orderings: content="..." property="og:description" and property="og:description" ... content="..."
    const descMatch = html.match(
      /content="([^"]+)"[^>]*(?:property="og:description"|name="description")/,
    ) || html.match(
      /(?:property="og:description"|name="description")[^>]*content="([^"]+)"/,
    );
    const desc = descMatch?.[1]?.trim();
    // Reject generic/empty descriptions
    if (!desc || /^https?:\/\//.test(desc)) return null;
    return desc;
  } catch {
    return null;
  }
}

export function isTweetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace("www.", "");
    return (
      (hostname === "x.com" || hostname === "twitter.com") &&
      parsed.pathname.includes("/status/")
    );
  } catch {
    return false;
  }
}
