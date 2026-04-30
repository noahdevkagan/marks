import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmark } from "@/lib/db";
import { createClient } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
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

    const { index, completed } = await req.json();

    const supabase = await createClient();
    const { data: enrichment } = await supabase
      .from("bookmark_enrichments")
      .select("action_items")
      .eq("bookmark_id", id)
      .single();

    if (!enrichment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const items = enrichment.action_items as Array<{
      text: string;
      completed: boolean;
      created_at: string;
    }>;

    if (index < 0 || index >= items.length) {
      return NextResponse.json({ error: "Invalid index" }, { status: 400 });
    }

    items[index].completed = completed;

    const { error } = await supabase
      .from("bookmark_enrichments")
      .update({ action_items: items })
      .eq("bookmark_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
