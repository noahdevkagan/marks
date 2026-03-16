import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/site-stats — public aggregate stats for the product
export async function GET() {
  try {
    const supabase = createAdminClient();

    // Total bookmarks saved
    const { count: totalBookmarks } = await supabase
      .from("bookmarks")
      .select("*", { count: "exact", head: true });

    // Total users
    const { data: userRows } = await supabase
      .from("bookmarks")
      .select("user_id")
      .limit(10000);
    const uniqueUsers = new Set(userRows?.map((r) => r.user_id) ?? []);

    // Total tags used
    const { count: totalTags } = await supabase
      .from("tags")
      .select("*", { count: "exact", head: true });

    // Total reading sessions
    const { count: totalSessions } = await supabase
      .from("reading_sessions")
      .select("*", { count: "exact", head: true });

    // Total reading time and words
    const { data: readingAgg } = await supabase
      .from("reading_sessions")
      .select("duration_seconds, word_count");

    const totalReadingSeconds = readingAgg?.reduce(
      (sum, s) => sum + (s.duration_seconds || 0),
      0,
    ) ?? 0;
    const totalWordsRead = readingAgg?.reduce(
      (sum, s) => sum + (s.word_count || 0),
      0,
    ) ?? 0;

    // Bookmarks by type
    const { data: typeRows } = await supabase
      .from("bookmarks")
      .select("type");
    const typeCounts: Record<string, number> = {};
    for (const row of typeRows ?? []) {
      const t = row.type || "article";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    // Bookmarks saved in the last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: bookmarksThisWeek } = await supabase
      .from("bookmarks")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString());

    // Bookmarks saved in the last 30 days
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const { count: bookmarksThisMonth } = await supabase
      .from("bookmarks")
      .select("*", { count: "exact", head: true })
      .gte("created_at", monthAgo.toISOString());

    return NextResponse.json({
      total_bookmarks: totalBookmarks ?? 0,
      total_users: uniqueUsers.size,
      total_tags: totalTags ?? 0,
      total_reading_sessions: totalSessions ?? 0,
      total_reading_seconds: totalReadingSeconds,
      total_words_read: totalWordsRead,
      bookmarks_this_week: bookmarksThisWeek ?? 0,
      bookmarks_this_month: bookmarksThisMonth ?? 0,
      bookmarks_by_type: typeCounts,
    });
  } catch (err) {
    console.error("Site stats error:", err);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
