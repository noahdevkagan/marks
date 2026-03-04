import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { ActionItemList } from "./action-item-list";

type ActionItem = {
  text: string;
  completed: boolean;
  created_at: string;
};

type EnrichedBookmark = {
  bookmark_id: number;
  summary: string | null;
  action_items: ActionItem[];
  processed_at: string | null;
  bookmark_title: string;
  bookmark_url: string;
  bookmark_type: string;
};

export default async function ActionsPage() {
  const supabase = await createClient();

  const { data: enrichments } = await supabase
    .from("bookmark_enrichments")
    .select("bookmark_id, summary, action_items, processed_at")
    .order("processed_at", { ascending: false });

  if (!enrichments || enrichments.length === 0) {
    return (
      <div className="container">
        <header>
          <h1>Actions</h1>
          <nav>
            <Link href="/">all</Link>
            <Link href="/read">read later</Link>
            <Link href="/actions">actions</Link>
            <Link href="/add" className="nav-add">
              + add
            </Link>
            <Link href="/settings" className="nav-settings">
              ⚙
            </Link>
          </nav>
        </header>
        <div className="empty">
          <p>
            No action items yet. Bookmark articles and they&rsquo;ll be
            automatically enriched with actionable takeaways.
          </p>
        </div>
      </div>
    );
  }

  // Fetch bookmark details for all enriched bookmarks
  const bookmarkIds = enrichments.map((e) => e.bookmark_id);
  const { data: bookmarks } = await supabase
    .from("bookmarks")
    .select("id, title, url, type")
    .in("id", bookmarkIds);

  const bookmarkMap = new Map(
    (bookmarks ?? []).map((b) => [b.id, b]),
  );

  // Build enriched bookmark list, only include ones with action items
  const enrichedBookmarks: EnrichedBookmark[] = enrichments
    .filter(
      (e) =>
        Array.isArray(e.action_items) && e.action_items.length > 0,
    )
    .map((e) => {
      const bk = bookmarkMap.get(e.bookmark_id);
      return {
        bookmark_id: e.bookmark_id,
        summary: e.summary,
        action_items: e.action_items as ActionItem[],
        processed_at: e.processed_at,
        bookmark_title: bk?.title ?? "",
        bookmark_url: bk?.url ?? "",
        bookmark_type: bk?.type ?? "article",
      };
    });

  // Stats
  const totalActions = enrichedBookmarks.reduce(
    (sum, eb) => sum + eb.action_items.length,
    0,
  );
  const completedActions = enrichedBookmarks.reduce(
    (sum, eb) =>
      sum + eb.action_items.filter((a) => a.completed).length,
    0,
  );

  return (
    <div className="container">
      <header>
        <h1>Actions</h1>
        <nav>
          <Link href="/">all</Link>
          <Link href="/read">read later</Link>
          <Link href="/actions">actions</Link>
          <Link href="/add" className="nav-add">
            + add
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="nav-signout">
              sign out
            </button>
          </form>
        </nav>
      </header>

      <div className="actions-stats">
        <span>
          {completedActions} / {totalActions} completed
        </span>
      </div>

      <ActionItemList enrichedBookmarks={enrichedBookmarks} />
    </div>
  );
}
