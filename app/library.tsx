import Link from "next/link";
import { Suspense } from "react";
import type { BookmarkWithTags } from "@/lib/db";
import { SearchBar } from "./search-bar";
import { Bookmarklet } from "./bookmarklet";
import { BookmarkItem } from "./bookmark-item";
import { ConfirmBanner } from "./confirm-banner";

const TAG_COLORS = [
  "#0066cc", "#e11d48", "#16a34a", "#ca8a04",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d",
];

function tagColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

export function Library({
  bookmarks,
  total,
  totalPages,
  page,
  tag,
  allTags,
  stats,
}: {
  bookmarks: BookmarkWithTags[];
  total: number;
  totalPages: number;
  page: number;
  tag?: string;
  allTags: { name: string; count: number }[];
  stats: { saved: number; read: number; readLater: number };
}) {
  const topTags = allTags.slice(0, 12);
  const readPercent = stats.saved > 0
    ? Math.round((stats.read / stats.saved) * 100)
    : 0;

  return (
    <div className="lib-shell">
      <aside className="lib-sidebar">
        <div className="lib-brand">
          <Link href="/">Mark<span>s</span></Link>
        </div>

        <div className="lib-sec">Library</div>
        <Link
          href="/"
          className={`lib-nav ${!tag ? "lib-nav-active" : ""}`}
        >
          <span>All bookmarks</span>
          <span className="lib-count">{stats.saved.toLocaleString()}</span>
        </Link>
        <Link href="/read" className="lib-nav">
          <span>Read later</span>
          <span className="lib-count">{stats.readLater.toLocaleString()}</span>
        </Link>
        <Link href="/kindle" className="lib-nav">
          <span>Kindle highlights</span>
        </Link>
        <Link href="/stats" className="lib-nav">
          <span>Stats</span>
        </Link>
        <Link href="/actions" className="lib-nav">
          <span>Actions</span>
        </Link>

        {topTags.length > 0 && (
          <>
            <div className="lib-sec">Top tags</div>
            {tag && (
              <Link href="/" className="lib-nav lib-nav-clear">
                <span>× Clear filter</span>
              </Link>
            )}
            {topTags.map((t) => (
              <Link
                key={t.name}
                href={`/?tag=${encodeURIComponent(t.name)}`}
                className={`lib-nav ${tag === t.name ? "lib-nav-active" : ""}`}
              >
                <span>
                  <i className="lib-td" style={{ background: tagColor(t.name) }} />
                  {t.name}
                </span>
                <span className="lib-count">{t.count}</span>
              </Link>
            ))}
          </>
        )}

        <div className="lib-sidebar-footer">
          <Link href="/add" className="lib-action lib-action-primary">+ Add bookmark</Link>
          <Link href="/settings" className="lib-action">⚙ Settings</Link>
        </div>
      </aside>

      <main className="lib-main">
        <Suspense>
          <ConfirmBanner />
        </Suspense>

        <div className="lib-topbar">
          <div className="lib-search-wrap">
            <SearchBar />
          </div>
        </div>

        <div className="lib-stats">
          <div className="lib-stat">
            <small>Saved</small>
            <strong>{stats.saved.toLocaleString()}</strong>
            <em>
              {tag ? `${total} tagged ${tag}` : "all bookmarks"}
            </em>
          </div>
          <div className="lib-stat">
            <small>Read</small>
            <strong>{stats.read.toLocaleString()}</strong>
            <em>{readPercent}% of library</em>
          </div>
          <div className="lib-stat">
            <small>Tags</small>
            <strong>{allTags.length.toLocaleString()}</strong>
            <em>across your bookmarks</em>
          </div>
        </div>

        {bookmarks.length === 0 ? (
          <div className="lib-empty">
            {tag ? (
              <p>No bookmarks tagged &ldquo;{tag}&rdquo;. <Link href="/">Show all</Link></p>
            ) : (
              <>
                <p>No bookmarks yet.</p>
                <p style={{ marginTop: "0.5rem" }}>
                  Get the <a href="/marks-extension.zip" download>Chrome extension</a>{" "}
                  to save bookmarks from any page.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <ul className="bookmark-list lib-bookmark-list">
              {bookmarks.map((b) => (
                <BookmarkItem key={b.id} bookmark={b} currentTag={tag} />
              ))}
            </ul>

            {totalPages > 1 && (
              <div className="pagination lib-pagination">
                {page > 1 && (
                  <Link
                    href={`/?${new URLSearchParams({
                      ...(tag ? { tag } : {}),
                      page: String(page - 1),
                    })}`}
                  >
                    ← prev
                  </Link>
                )}
                <span className="date">
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={`/?${new URLSearchParams({
                      ...(tag ? { tag } : {}),
                      page: String(page + 1),
                    })}`}
                  >
                    next →
                  </Link>
                )}
              </div>
            )}
          </>
        )}

        <Bookmarklet />
      </main>
    </div>
  );
}
