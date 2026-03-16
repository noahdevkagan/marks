import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmark, getAllTags, setBookmarkTags } from "@/lib/db";
import { enrichTweet, enrichArticle, enrichVideo } from "@/lib/ai";
import {
  extractYouTubeId,
  fetchYouTubeTranscript,
  findQuoteTimestamp,
  formatTimestamp,
} from "@/lib/youtube";
import { createClient } from "@/lib/supabase-server";

export const maxDuration = 60;

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

    // Get user's existing tags for vocabulary matching
    const existingTags = await getAllTags();
    const tagNames = existingTags.map((t) => t.name);

    let enrichment: {
      summary: string;
      action_items: { text: string; url?: string }[];
      tags: string[];
    };

    if (bookmark.type === "tweet") {
      // Tweet enrichment: use description (tweet text)
      const tweetText = bookmark.description || bookmark.title || "";
      if (!tweetText.trim()) {
        return NextResponse.json(
          { error: "No text content to analyze" },
          { status: 422 },
        );
      }
      const handleMatch = bookmark.title.match(/^@(\w+):/);
      const handle = handleMatch?.[1] || "";
      enrichment = await enrichTweet(tweetText, handle, tagNames);
    } else if (bookmark.type === "video" || bookmark.type === "podcast") {
      // Video/podcast enrichment: use archived transcript
      const supabase = await createClient();
      const { data: archived } = await supabase
        .from("archived_content")
        .select("content_text")
        .eq("bookmark_id", id)
        .single();

      const contentText =
        archived?.content_text || bookmark.description || "";
      if (!contentText.trim()) {
        return NextResponse.json(
          { error: "No transcript to analyze. Archive the video first." },
          { status: 400 },
        );
      }

      const videoId = extractYouTubeId(bookmark.url);

      // Fetch transcript segments for timestamp resolution on quotes
      let transcriptSegments: Awaited<ReturnType<typeof fetchYouTubeTranscript>> = null;
      if (videoId) {
        transcriptSegments = await fetchYouTubeTranscript(videoId);
      }

      const videoEnrichment = await enrichVideo(
        contentText,
        bookmark.title,
        tagNames,
      );

      // Build enrichment items with type discriminators
      const items: Record<string, unknown>[] = [];

      if (videoEnrichment.hook) {
        items.push({
          type: "hook",
          text: videoEnrichment.hook,
          completed: false,
          created_at: new Date().toISOString(),
        });
      }
      for (const insight of videoEnrichment.key_insights) {
        items.push({
          type: "insight",
          text: insight,
          completed: false,
          created_at: new Date().toISOString(),
        });
      }
      for (const quote of videoEnrichment.quotes) {
        const offsetSec = transcriptSegments
          ? findQuoteTimestamp(quote.text, transcriptSegments.segments)
          : null;
        items.push({
          type: "quote",
          text: quote.text,
          timestamp: offsetSec !== null ? formatTimestamp(offsetSec) : null,
          timestamp_seconds: offsetSec,
          video_id: videoId,
          completed: false,
          created_at: new Date().toISOString(),
        });
      }
      for (const action of videoEnrichment.action_items) {
        items.push({
          type: "action",
          text: action.text,
          url: action.url || null,
          completed: false,
          created_at: new Date().toISOString(),
        });
      }

      // Upsert and return early
      const supabase2 = await createClient();
      const { error } = await supabase2.from("bookmark_enrichments").upsert(
        {
          bookmark_id: id,
          summary: videoEnrichment.hook,
          action_items: items,
          ai_tags: videoEnrichment.tags,
          model: "claude-3-haiku-20240307",
          processed_at: new Date().toISOString(),
        },
        { onConflict: "bookmark_id" },
      );

      if (error) {
        console.error("Enrichment upsert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const currentTags = bookmark.tags ?? [];
      const mergedTags = [
        ...new Set([...currentTags, ...videoEnrichment.tags]),
      ];
      await setBookmarkTags(id, mergedTags);

      return NextResponse.json({
        ok: true,
        summary: videoEnrichment.hook,
        action_items: items,
        tags: videoEnrichment.tags,
      });
    } else {
      // Article/other: use archived content text
      const supabase = await createClient();
      const { data: archived } = await supabase
        .from("archived_content")
        .select("content_text")
        .eq("bookmark_id", id)
        .single();

      const contentText =
        archived?.content_text || bookmark.description || "";
      if (!contentText.trim()) {
        return NextResponse.json(
          { error: "No content to analyze. Archive the page first." },
          { status: 422 },
        );
      }

      enrichment = await enrichArticle(contentText, bookmark.title, tagNames);
    }

    // Upsert enrichment data
    const supabase = await createClient();
    const { error } = await supabase.from("bookmark_enrichments").upsert(
      {
        bookmark_id: id,
        summary: enrichment.summary,
        action_items: enrichment.action_items.map((a) => ({
          text: a.text,
          url: a.url || null,
          completed: false,
          created_at: new Date().toISOString(),
        })),
        ai_tags: enrichment.tags,
        model: "claude-3-haiku-20240307",
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
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
