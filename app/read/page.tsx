import Link from "next/link";
import { getBookmarks } from "@/lib/db";
import { MarkReadButton } from "./mark-read-button";
import { DeleteButton } from "../delete-button";

export default async function ReadLaterPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);

  const { bookmarks, total } = await getBookmarks({
    page,
    unreadOnly: true,
  });

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="container">
      <header>
        <h1>Read Later</h1>
        <nav>
          <Link href="/">all</Link>
          <Link href="/read">read later</Link>
          <Link href="/actions">actions</Link>
          <Link href="/stats">stats</Link>
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

      {bookmarks.length === 0 ? (
        <div className="empty">
          <p>Nothing to read. Nice work.</p>
        </div>
      ) : (
        <>
          <p className="read-count">{total} unread</p>
          <ul className="bookmark-list">
            {bookmarks.map((b) => (
              <li key={b.id} className="bookmark-item">
                <div className="bookmark-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="favicon"
                    src={`https://www.google.com/s2/favicons?sz=32&domain=${new URL(b.url).hostname}`}
                    alt=""
                    width={16}
                    height={16}
                    loading="lazy"
                  />
                  <div className="bookmark-content">
                    <a
                      href={b.url}
                      className="bookmark-title"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {b.title || b.url}
                    </a>
                    <span className="bookmark-url">
                      {new URL(b.url).hostname.replace("www.", "")}
                    </span>
                    <div className="bookmark-meta">
                      <span className="date">
                        {new Date(b.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      {b.tags.length > 0 && (
                        <div className="tags">
                          {b.tags.map((t) => (
                            <Link
                              key={t}
                              href={`/?tag=${encodeURIComponent(t)}`}
                              className="tag"
                            >
                              {t}
                            </Link>
                          ))}
                        </div>
                      )}
                      <MarkReadButton bookmarkId={b.id} />
                      <DeleteButton bookmarkId={b.id} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="pagination">
              {page > 1 && (
                <Link href={`/read?page=${page - 1}`}>&larr; prev</Link>
              )}
              <span className="date">
                {page} / {totalPages}
              </span>
              {page < totalPages && (
                <Link href={`/read?page=${page + 1}`}>next &rarr;</Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
