import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAllTags } from "@/lib/db";
import { extractMetadata } from "@/lib/extract";
import { fetchTweetOembed, isTweetUrl } from "@/lib/twitter";

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
    // Twitter/X is a client-rendered SPA — server fetch gets no useful metadata.
    // Use oembed instead.
    if (isTweetUrl(url)) {
      const oembed = await fetchTweetOembed(url);
      if (oembed) {
        const title = `@${oembed.author}: ${oembed.text}`;
        const description = oembed.text;
        const corpus = [title, description, url].join(" ").toLowerCase();
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
      }
      // oembed failed — fall through to generic fetch as last resort
    }

    const { title, description, keywords } = await extractMetadata(url);

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
