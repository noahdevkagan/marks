import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";

export async function POST() {
  try {
    const user = await requireUser();

    // Use service role key to delete the user (admin operation)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Get all bookmark IDs for this user
    const { data: bookmarks } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", user.id);

    const bookmarkIds = (bookmarks ?? []).map((b) => b.id);

    if (bookmarkIds.length > 0) {
      // Delete related data first
      await supabase.from("bookmark_tags").delete().in("bookmark_id", bookmarkIds);
      await supabase.from("archived_content").delete().in("bookmark_id", bookmarkIds);
      await supabase.from("bookmarks").delete().eq("user_id", user.id);
    }

    // Delete the auth user
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
