import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmarks, createBookmark, setBookmarkTags, getAllTags } from "@/lib/db";
import { extractMetadata } from "@/lib/extract";
import { detectBookmarkType } from "@/lib/detect-type";
import { enrichTweet } from "@/lib/ai";
import { createClient } from "@/lib/supabase-server";
import { fetchTweetOembed } from "@/lib/twitter";

function looksLikeUrl(title: string): boolean {
  return !title || /^https?:\/\//.test(title) || title === title.trim().replace(/\s/g, "");
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get("tag") ?? undefined;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const unreadOnly = searchParams.get("hide_read") === "1";

    const result = await getBookmarks({ tag, page, unreadOnly });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    let title = body.title ?? "";
    let description = body.description ?? "";

    const type = body.type ?? detectBookmarkType(body.url);

    // For tweets, always use oembed unless title already has @handle: format
    // (X.com is a client-rendered SPA — server-side fetch gets garbage)
    if (type === "tweet") {
      if (!title.match(/^@\w+:/)) {
        try {
          const oembed = await fetchTweetOembed(body.url);
          if (oembed) {
            title = `@${oembed.author}: ${oembed.text}`;
            if (!description) description = oembed.text;
          }
        } catch {
          // keep whatever title we have
        }
      }
    } else if (looksLikeUrl(title)) {
      // For non-tweets, fetch metadata if title is missing or looks like a URL
      try {
        const meta = await extractMetadata(body.url);
        if (meta.title) title = meta.title;
      } catch {
        // keep whatever title we have
      }
    }

    const bookmark = await createBookmark({
      url: body.url,
      title,
      description,
      tags: body.tags ?? [],
      is_read: body.is_read ?? false,
      user_id: user.id,
      type,
      type_metadata: body.type_metadata ?? {},
    });

    // Auto-archive: trigger archive endpoint as a separate serverless invocation
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://marks-drab.vercel.app";
    const authHeader = req.headers.get("authorization") || "";
    fetch(`${appUrl}/api/bookmarks/${bookmark.id}/archive`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force_archive: false }),
    }).catch(() => {});

    // Auto-suggest tags if none provided
    if (!body.tags || body.tags.length === 0) {
      try {
        const { suggestTags } = await import("@/lib/suggest-tags");
        const existingTags = await getAllTags();
        const tagNames = existingTags.map((t) => t.name);
        const suggested = await suggestTags(body.url, tagNames);
        if (suggested.length > 0) {
          await setBookmarkTags(bookmark.id, suggested);
        }
      } catch {
        // tag suggestion failed, not critical
      }
    }

    // Enrich tweets directly (archive route can't extract article from tweets)
    if (type === "tweet") {
      try {
        const tweetText = body.description || title || "";
        if (tweetText.trim()) {
          const handleMatch = title.match(/^@(\w+):/);
          const handle = handleMatch?.[1] || "";
          const existingTags = await getAllTags();
          const tagNames = existingTags.map((t) => t.name);
          const enrichment = await enrichTweet(tweetText, handle, tagNames);

          const supabase = await createClient();
          await supabase.from("bookmark_enrichments").upsert(
            {
              bookmark_id: bookmark.id,
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

          // Merge AI tags
          const currentTags = bookmark.tags ?? [];
          const mergedTags = [
            ...new Set([...currentTags, ...enrichment.tags]),
          ];
          await setBookmarkTags(bookmark.id, mergedTags);
        }
      } catch (err) {
        console.error("Tweet enrichment error:", err);
      }
    }

    return NextResponse.json(bookmark, { status: 201 });
  } catch (e: unknown) {
    // Supabase throws plain objects (PostgrestError) with .message, not Error instances
    const msg =
      e instanceof Error
        ? e.message
        : e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : JSON.stringify(e);
    console.error("[POST /api/bookmarks] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
