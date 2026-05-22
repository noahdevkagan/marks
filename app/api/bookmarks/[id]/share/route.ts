import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmark, setBookmarkPublic, setBookmarkPrivate } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

function ownerDisplayFromUser(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata ?? {};
  const name = typeof meta.name === "string" ? meta.name : undefined;
  const fullName = typeof meta.full_name === "string" ? meta.full_name : undefined;
  if (name) return name.split(" ")[0];
  if (fullName) return fullName.split(" ")[0];
  if (user.email) return user.email.split("@")[0];
  return "Someone";
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    const bookmark = await getBookmark(id);
    if (!bookmark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (bookmark.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await setBookmarkPublic(id, ownerDisplayFromUser(user));
    if (!result) {
      return NextResponse.json({ error: "Failed to share" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, slug: result.slug });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    const bookmark = await getBookmark(id);
    if (!bookmark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (bookmark.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ok = await setBookmarkPrivate(id);
    if (!ok) {
      return NextResponse.json({ error: "Failed to unshare" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
