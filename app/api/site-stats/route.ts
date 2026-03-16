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

    // Daily bookmarks for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: recentBookmarks } = await supabase
      .from("bookmarks")
      .select("created_at, user_id")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    const dailyMap = new Map<string, { bookmarks: number; users: Set<string> }>();
    for (const row of recentBookmarks ?? []) {
      const day = new Date(row.created_at).toISOString().slice(0, 10);
      const entry = dailyMap.get(day) ?? { bookmarks: 0, users: new Set() };
      entry.bookmarks++;
      entry.users.add(row.user_id);
      dailyMap.set(day, entry);
    }
    const daily_bookmarks = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, bookmarks: v.bookmarks, users: v.users.size }));

    // New users by day — based on each user's first bookmark
    const { data: allBookmarks } = await supabase
      .from("bookmarks")
      .select("user_id, created_at")
      .order("created_at", { ascending: true });

    const firstSeen = new Map<string, string>();
    for (const row of allBookmarks ?? []) {
      if (!firstSeen.has(row.user_id)) {
        firstSeen.set(row.user_id, new Date(row.created_at).toISOString().slice(0, 10));
      }
    }
    const newUsersMap = new Map<string, number>();
    for (const day of firstSeen.values()) {
      newUsersMap.set(day, (newUsersMap.get(day) ?? 0) + 1);
    }
    const new_users_by_day = [...newUsersMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day, new_users: count }));

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
      daily_bookmarks,
      new_users_by_day,
    });
  } catch (err) {
    console.error("Site stats error:", err);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
