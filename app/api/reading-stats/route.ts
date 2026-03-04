import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";

// GET /api/reading-stats — fetch reading stats for the current user
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_reading_stats", {
      user_uuid: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// POST /api/reading-stats — record or update a reading session
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { bookmark_id, session_id, duration_seconds, word_count, finished } =
      body;

    if (!bookmark_id) {
      return NextResponse.json(
        { error: "bookmark_id is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // If session_id is provided, update existing session
    if (session_id) {
      const { error } = await supabase
        .from("reading_sessions")
        .update({
          duration_seconds: duration_seconds ?? 0,
          word_count: word_count ?? 0,
          finished: finished ?? false,
          ended_at: new Date().toISOString(),
        })
        .eq("id", session_id)
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ session_id });
    }

    // Create new session
    const { data, error } = await supabase
      .from("reading_sessions")
      .insert({
        user_id: user.id,
        bookmark_id,
        word_count: word_count ?? 0,
        duration_seconds: 0,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session_id: data.id });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
