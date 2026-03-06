import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmark, updateBookmark, deleteBookmark } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const bookmark = await getBookmark(parseInt(id, 10));
    if (!bookmark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(bookmark);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await req.json();

    const bookmark = await updateBookmark(parseInt(id, 10), {
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
    await requireUser();
    const { id } = await params;
    const ok = await deleteBookmark(parseInt(id, 10));

    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
