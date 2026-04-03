import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmarkByUrl } from "@/lib/db";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  const bookmark = await getBookmarkByUrl(url, user.id);
  if (!bookmark) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({
    exists: true,
    tags: bookmark.tags,
    title: bookmark.title,
    description: bookmark.description,
  });
}
