import Link from "next/link";
import { Suspense } from "react";
import { getBookmarks, getAllTags } from "@/lib/db";
import { SearchBar } from "./search-bar";
import { Bookmarklet } from "./bookmarklet";
import { BookmarkItem } from "./bookmark-item";
import { ConfirmBanner } from "./confirm-banner";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; page?: string }>;
}) {
  const params = await searchParams;
  const tag = params.tag;
  const page = parseInt(params.page ?? "1", 10);

  const [{ bookmarks, total }, allTags] = await Promise.all([
    getBookmarks({ tag, page }),
    getAllTags(),
  ]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="container">
      <header>
        <h1><Link href="/">Marks</Link></h1>
        <nav>
          <Link href="/">all</Link>
          <Link href="/read">read later</Link>
          <Link href="/actions">actions</Link>
          <Link href="/stats">stats</Link>
          <Link href="/add" className="nav-add">
            + add
          </Link>
          <Link href="/settings" className="nav-settings">
            ⚙
          </Link>
        </nav>
      </header>

      <Suspense>
        <ConfirmBanner />
      </Suspense>

      <SearchBar />

      {allTags.length > 0 && (
        <div className="tag-list">
          {tag && (
            <Link href="/" className="tag">
              &times; clear
            </Link>
          )}
          {allTags.slice(0, 40).map((t) => (
            <Link
              key={t.name}
              href={`/?tag=${encodeURIComponent(t.name)}`}
              className={`tag ${tag === t.name ? "active" : ""}`}
            >
              {t.name} ({t.count})
            </Link>
          ))}
        </div>
      )}

      {bookmarks.length === 0 ? (
        <div className="empty">
          {tag ? (
            <p>
              No bookmarks tagged &ldquo;{tag}&rdquo;.{" "}
              <Link href="/">Show all</Link>
            </p>
          ) : (
            <p>No bookmarks yet.</p>
          )}
        </div>
      ) : (
        <>
          <ul className="bookmark-list">
            {bookmarks.map((b) => (
              <BookmarkItem key={b.id} bookmark={b} currentTag={tag} />
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="pagination">
              {page > 1 && (
                <Link
                  href={`/?${new URLSearchParams({
                    ...(tag ? { tag } : {}),
                    page: String(page - 1),
                  })}`}
                >
                  &larr; prev
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
                  next &rarr;
                </Link>
              )}
            </div>
          )}
        </>
      )}

      <Bookmarklet />
    </div>
  );
}
