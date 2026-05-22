import { ImageResponse } from "next/og";
import { getPublicBookmarkBySlug } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "Shared on Marks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ slug: string }> };

const FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15";

/** Pull og:image (and a couple of fallbacks) directly from the article URL. */
async function fetchArticleImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": FETCH_UA },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const candidates = [
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
      /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i,
      /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
    ];
    for (const re of candidates) {
      const m = html.match(re);
      if (m?.[1]) return resolveUrl(m[1], url);
    }
    return null;
  } catch {
    return null;
  }
}

function resolveUrl(src: string, base: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

/** Pick the first inline image out of archived HTML as a fallback. */
function firstImageFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

export default async function OgImage({ params }: Props) {
  const { slug } = await params;
  const bookmark = await getPublicBookmarkBySlug(slug);

  const title = bookmark?.title || "Shared on Marks";
  const owner = bookmark?.owner_display || "Someone";
  let domain = "";
  if (bookmark?.url) {
    try {
      domain = new URL(bookmark.url).hostname.replace("www.", "");
    } catch {
      domain = "";
    }
  }

  let articleImage: string | null = firstImageFromHtml(
    bookmark?.archived?.content_html,
  );
  if (!articleImage && bookmark?.url) {
    articleImage = await fetchArticleImage(bookmark.url);
  }

  const titleLen = title.length;
  const titleSize = titleLen > 140 ? 48 : titleLen > 90 ? 58 : titleLen > 50 ? 70 : 84;
  const displayTitle = title.length > 220 ? title.slice(0, 217) + "…" : title;

  if (articleImage) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            position: "relative",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={articleImage}
            alt=""
            width={1200}
            height={630}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 50,
              left: 60,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(255,255,255,0.95)",
              padding: "10px 18px",
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 600,
              color: "#1a1a1a",
              letterSpacing: "0.02em",
            }}
          >
            {domain || "shared"}
          </div>

          <div
            style={{
              position: "absolute",
              top: 50,
              right: 60,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(0,0,0,0.55)",
              padding: "10px 18px",
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 600,
              color: "white",
              letterSpacing: "0.02em",
            }}
          >
            <span>📑</span>
            <span>Saved on Marks</span>
          </div>
        </div>
      ),
      { ...size },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 80px",
          background: "linear-gradient(135deg, #fdf6e3 0%, #f5ead0 100%)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {domain || "shared article"}
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "Georgia, serif",
            fontSize: titleSize,
            fontWeight: 700,
            color: "#1a1a1a",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {displayTitle}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 24,
            color: "#444",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: "linear-gradient(135deg, #0066cc, #4d9fff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 700,
                color: "white",
              }}
            >
              {owner.charAt(0).toUpperCase()}
            </div>
            <span>
              Shared by <b style={{ color: "#1a1a1a" }}>{owner}</b>
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 22,
              color: "#666",
            }}
          >
            <span>📑</span>
            <span>Saved on Marks</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
