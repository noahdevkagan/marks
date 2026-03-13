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
