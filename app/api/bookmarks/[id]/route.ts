import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmark, updateBookmark, deleteBookmark } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const bookmark = await getBookmark(parseInt(id, 10));
    if (!bookmark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (bookmark.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(bookmark);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const numId = parseInt(id, 10);

    const existing = await getBookmark(numId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const bookmark = await updateBookmark(numId, {
      title: body.title,
      url: body.url,
      description: body.description,
      is_read: body.is_read,
      is_archived: body.is_archived,
      tags: body.tags,
      ...(body.type !== undefined && { type: body.type }),
      ...(body.type_metadata !== undefined && { type_metadata: body.type_metadata }),
    });

    if (!bookmark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(bookmark);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const numId = parseInt(id, 10);

    const existing = await getBookmark(numId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ok = await deleteBookmark(numId);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
