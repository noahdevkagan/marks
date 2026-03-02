import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmark, getAllTags, setBookmarkTags } from "@/lib/db";
import { enrichTweet } from "@/lib/ai";
import { createClient } from "@/lib/supabase-server";

export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    const bookmark = await getBookmark(id);
    if (!bookmark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Use description as tweet text (content-twitter.js stores tweet text there)
    const tweetText = bookmark.description || bookmark.title || "";
    if (!tweetText.trim()) {
      return NextResponse.json(
        { error: "No text content to analyze" },
        { status: 422 },
      );
    }

    // Get user's existing tags for vocabulary matching
    const existingTags = await getAllTags();
    const tagNames = existingTags.map((t) => t.name);

    // Extract handle from title (format: "@handle: text...")
    const handleMatch = bookmark.title.match(/^@(\w+):/);
    const handle = handleMatch?.[1] || "";

    const enrichment = await enrichTweet(tweetText, handle, tagNames);

    // Upsert enrichment data
    const supabase = await createClient();
    const { error } = await supabase.from("bookmark_enrichments").upsert(
      {
        bookmark_id: id,
        summary: enrichment.summary,
        action_items: enrichment.action_items.map((a) => ({
          text: a.text,
          completed: false,
          created_at: new Date().toISOString(),
        })),
        ai_tags: enrichment.tags,
        model: "claude-3-5-haiku-20241022",
        processed_at: new Date().toISOString(),
      },
      { onConflict: "bookmark_id" },
    );

    if (error) {
      console.error("Enrichment upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Merge AI tags into the bookmark's actual tags
    const currentTags = bookmark.tags ?? [];
    const mergedTags = [...new Set([...currentTags, ...enrichment.tags])];
    await setBookmarkTags(id, mergedTags);

    return NextResponse.json({
      ok: true,
      summary: enrichment.summary,
      action_items: enrichment.action_items,
      tags: enrichment.tags,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Enrich error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
