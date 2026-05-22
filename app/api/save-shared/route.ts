import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createBookmark, getPublicBookmarkBySlug } from "@/lib/db";

/** Save a publicly-shared bookmark into the current user's library. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { slug } = await req.json();
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const shared = await getPublicBookmarkBySlug(slug);
    if (!shared) {
      return NextResponse.json({ error: "Shared article not found" }, { status: 404 });
    }

    // Don't re-save into the owner's own library
    if (shared.user_id === user.id) {
      return NextResponse.json({ ok: true, alreadyOwner: true });
    }

    const bookmark = await createBookmark({
      url: shared.url,
      title: shared.title,
      description: shared.description ?? "",
      user_id: user.id,
      type: shared.type,
      type_metadata: shared.type_metadata ?? {},
    });

    return NextResponse.json({ ok: true, bookmark_id: bookmark.id });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
