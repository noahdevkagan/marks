import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";

// GET /api/reading-stats — fetch reading stats for the current user
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    // Count total bookmarks saved (always works regardless of reading_sessions)
    const { count: totalSaved } = await supabase
      .from("bookmarks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    // Try the RPC first
    const { data, error } = await supabase.rpc("get_reading_stats", {
      user_uuid: user.id,
    });

    if (!error && data) {
      return NextResponse.json({
        ...data,
        total_bookmarks_saved: totalSaved ?? 0,
      });
    }

    // Fallback: query directly if RPC doesn't exist yet
    const { data: sessions, error: sessionsError } = await supabase
      .from("reading_sessions")
      .select("bookmark_id, started_at, duration_seconds, word_count")
      .eq("user_id", user.id);

    if (sessionsError || !sessions || sessions.length === 0) {
      return NextResponse.json({
        total_bookmarks_saved: totalSaved ?? 0,
        total_articles_read: 0,
        total_words_read: 0,
        total_reading_seconds: 0,
        articles_this_week: 0,
        articles_this_month: 0,
        streak_days: 0,
        daily_reading: [],
        top_reading_days: [],
      });
    }

    const meaningful = sessions.filter((s) => s.duration_seconds > 10);
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const uniqueArticles = new Set(meaningful.map((s) => s.bookmark_id));
    const weekArticles = new Set(
      meaningful
        .filter((s) => new Date(s.started_at) >= weekStart)
        .map((s) => s.bookmark_id),
    );
    const monthArticles = new Set(
      meaningful
        .filter((s) => new Date(s.started_at) >= monthStart)
        .map((s) => s.bookmark_id),
    );

    // Daily reading for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dailyMap = new Map<
      string,
      { articles: Set<number>; seconds: number; words: number }
    >();
    for (const s of sessions.filter(
      (s) => new Date(s.started_at) >= thirtyDaysAgo,
    )) {
      const day = new Date(s.started_at).toISOString().slice(0, 10);
      const entry = dailyMap.get(day) ?? {
        articles: new Set(),
        seconds: 0,
        words: 0,
      };
      entry.articles.add(s.bookmark_id);
      entry.seconds += s.duration_seconds;
      entry.words += s.word_count;
      dailyMap.set(day, entry);
    }

    const daily_reading = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        day,
        articles: v.articles.size,
        seconds: v.seconds,
        words: v.words,
      }));

    return NextResponse.json({
      total_bookmarks_saved: totalSaved ?? 0,
      total_articles_read: uniqueArticles.size,
      total_words_read: meaningful.reduce((sum, s) => sum + s.word_count, 0),
      total_reading_seconds: sessions.reduce(
        (sum, s) => sum + s.duration_seconds,
        0,
      ),
      articles_this_week: weekArticles.size,
      articles_this_month: monthArticles.size,
      streak_days: 0,
      daily_reading,
      top_reading_days: daily_reading
        .filter((d) => d.words > 0)
        .sort((a, b) => b.words - a.words)
        .slice(0, 5),
    });
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
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Reading stats error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
