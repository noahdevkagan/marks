export type BookmarkType =
  | "article"
  | "tweet"
  | "video"
  | "image"
  | "pdf"
  | "product";

export function detectBookmarkType(url: string): BookmarkType {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace("www.", "");
    const pathname = parsed.pathname.toLowerCase();

    // Tweet
    if (
      (hostname === "x.com" || hostname === "twitter.com") &&
      pathname.includes("/status/")
    ) {
      return "tweet";
    }

    // Video
    if (
      [
        "youtube.com",
        "youtu.be",
        "vimeo.com",
        "twitch.tv",
        "dailymotion.com",
      ].includes(hostname)
    ) {
      return "video";
    }

    // Image (direct link)
    if (/\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/.test(pathname)) {
      return "image";
    }

    // PDF
    if (/\.pdf(\?.*)?$/.test(pathname)) {
      return "pdf";
    }

    // Product pages
    if (
      hostname.endsWith("amazon.com") ||
      hostname.endsWith("amazon.co.uk") ||
      hostname.endsWith("amazon.de") ||
      hostname.endsWith("amazon.ca")
    ) {
      if (pathname.includes("/dp/") || pathname.includes("/gp/product/")) {
        return "product";
      }
    }
    if (hostname.includes("shopify.com") || pathname.includes("/products/")) {
      return "product";
    }

    return "article";
  } catch {
    return "article";
  }
}
