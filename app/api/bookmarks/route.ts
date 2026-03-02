import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmarks, createBookmark } from "@/lib/db";

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
  try {
    const user = await requireUser();
    const body = await req.json();

    const bookmark = await createBookmark({
      url: body.url,
      title: body.title ?? "",
      description: body.description ?? "",
      tags: body.tags ?? [],
      is_read: body.is_read ?? false,
      user_id: user.id,
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

    // Auto-enrich Twitter bookmarks in background (fire-and-forget)
    const isTwitter =
      body.url?.includes("x.com/") || body.url?.includes("twitter.com/");
    if (isTwitter) {
      fetch(`${appUrl}/api/bookmarks/${bookmark.id}/enrich`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      }).catch(() => {});
    }

    return NextResponse.json(bookmark, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
