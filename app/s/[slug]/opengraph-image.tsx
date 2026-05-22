import { ImageResponse } from "next/og";
import { getPublicBookmarkBySlug } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "Shared on Marks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: { slug: string } };

export default async function OgImage({ params }: Props) {
  const bookmark = await getPublicBookmarkBySlug(params.slug);
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

  // Shrink font for very long titles
  const titleLen = title.length;
  const titleSize = titleLen > 120 ? 52 : titleLen > 80 ? 64 : titleLen > 50 ? 76 : 88;

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
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Top: brand + domain */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 36,
              fontWeight: 600,
              color: "#1a1a1a",
              letterSpacing: "-0.02em",
            }}
          >
            <span style={{ marginRight: 14, fontSize: 40 }}>📑</span>
            Marks
          </div>
          {domain && (
            <div
              style={{
                fontSize: 26,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {domain}
            </div>
          )}
        </div>

        {/* Middle: article title */}
        <div
          style={{
            display: "flex",
            fontSize: titleSize,
            fontWeight: 700,
            color: "#1a1a1a",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {title.length > 180 ? title.slice(0, 177) + "…" : title}
        </div>

        {/* Bottom: shared by + CTA */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 28,
              color: "#444",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                background: "linear-gradient(135deg, #0066cc, #4d9fff)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 700,
                marginRight: 16,
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
              fontSize: 24,
              color: "#1a1a1a",
              background: "#fff",
              border: "2px solid #1a1a1a",
              padding: "12px 22px",
              borderRadius: 10,
              fontWeight: 600,
            }}
          >
            Save to Marks →
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
