import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmarks, createBookmark, setBookmarkTags, getAllTags } from "@/lib/db";
import { extractMetadata } from "@/lib/extract";
import { detectBookmarkType } from "@/lib/detect-type";

function looksLikeUrl(title: string): boolean {
  return !title || /^https?:\/\//.test(title) || title === title.trim().replace(/\s/g, "");
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get("tag") ?? undefined;
    const page = parseInt(searchParams.get("page") ?? "1", 10);

    const result = await getBookmarks({ tag, page });
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

    // If title is missing or looks like a URL, fetch the real title
    if (looksLikeUrl(title)) {
      try {
        const meta = await extractMetadata(body.url);
        if (meta.title) title = meta.title;
      } catch {
        // keep whatever title we have
      }
    }

    const type = body.type ?? detectBookmarkType(body.url);

    const bookmark = await createBookmark({
      url: body.url,
      title,
      description: body.description ?? "",
      tags: body.tags ?? [],
      is_read: body.is_read ?? false,
      user_id: user.id,
      type,
      type_metadata: body.type_metadata ?? {},
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://marks-drab.vercel.app";
    const authHeader = req.headers.get("authorization") || "";

    // Auto-archive article content in background (fire-and-forget)
    fetch(`${appUrl}/api/bookmarks/${bookmark.id}/archive`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force_archive: false }),
    }).catch(() => {});

    // Auto-suggest tags in background if none provided
    if (!body.tags || body.tags.length === 0) {
      (async () => {
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
      })();
    }

    // Auto-enrich Twitter bookmarks in background (fire-and-forget)
    if (type === "tweet") {
      fetch(`${appUrl}/api/bookmarks/${bookmark.id}/enrich`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      }).catch(() => {});
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
