import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAllTags } from "@/lib/db";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function extractMeta(html: string, attr: string, value: string): string {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(re);
  if (match) return match[1];
  // Try reversed order (content before property)
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${value}["']`,
    "i",
  );
  return html.match(re2)?.[1] ?? "";
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() ?? "";
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ title: "", description: "", suggestedTags: [] });
    }

    const html = await res.text();

    const ogTitle = extractMeta(html, "property", "og:title");
    const title = ogTitle || extractTitle(html);

    const ogDesc = extractMeta(html, "property", "og:description");
    const metaDesc = extractMeta(html, "name", "description");
    const description = ogDesc || metaDesc;

    const keywords = extractMeta(html, "name", "keywords");

    // Build text corpus for tag matching (word boundary-safe)
    const corpus = [title, description, keywords, url].join(" ").toLowerCase();

    // Match existing user tags against the corpus using word boundaries
    const allTags = await getAllTags();
    const suggestedTags = allTags
      .filter((t) => {
        const tag = t.name.toLowerCase();
        if (tag.length < 2) return false;
        const re = new RegExp(`\\b${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        return re.test(corpus);
      })
      .slice(0, 8)
      .map((t) => t.name);

    return NextResponse.json({ title, description, suggestedTags });
  } catch {
    return NextResponse.json({ title: "", description: "", suggestedTags: [] });
  }
}
