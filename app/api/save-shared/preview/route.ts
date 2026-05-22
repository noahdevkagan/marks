import { NextRequest, NextResponse } from "next/server";
import { getPublicBookmarkBySlug } from "@/lib/db";

/** Anon-readable: returns the public title + owner for a shared slug. Used for the signup banner. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  const bookmark = await getPublicBookmarkBySlug(slug);
  if (!bookmark) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    title: bookmark.title,
    owner: bookmark.owner_display,
  });
}
