import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAllTags } from "@/lib/db";
import { extractMetadata } from "@/lib/extract";
import { suggestTags } from "@/lib/suggest-tags";
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
    let title = "";
    let description = "";

    // Twitter/X is a client-rendered SPA — server fetch gets no useful metadata.
    // Use oembed instead.
    if (isTweetUrl(url)) {
      const oembed = await fetchTweetOembed(url);
      if (oembed) {
        title = `@${oembed.author}: ${oembed.text}`;
        description = oembed.text;
      }
    }

    if (!title) {
      const meta = await extractMetadata(url);
      title = meta.title;
      description = meta.description;
    }

    // Use AI-powered tag suggestions
    const allTags = await getAllTags();
    const tagNames = allTags.map((t) => t.name);
    const suggestedTags = await suggestTags(url, tagNames, title);

    return NextResponse.json({ title, description, suggestedTags });
  } catch {
    return NextResponse.json({ title: "", description: "", suggestedTags: [] });
  }
}
