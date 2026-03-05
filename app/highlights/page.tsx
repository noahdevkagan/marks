"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";

type Highlight = {
  text: string;
  color: string;
  location: number | null;
  page: number | null;
  note: string | null;
};

type Book = {
  asin: string;
  title: string;
  author: string;
  cover: string | null;
  highlights: Highlight[];
};

type KindleData = {
  exportedAt: string;
  books: Book[];
};

const STORAGE_KEY = "marks-kindle-data";

const HIGHLIGHT_COLORS: Record<string, { bg: string; border: string }> = {
  yellow: { bg: "rgba(250, 204, 21, 0.15)", border: "#eab308" },
  blue: { bg: "rgba(59, 130, 246, 0.12)", border: "#3b82f6" },
  pink: { bg: "rgba(236, 72, 153, 0.12)", border: "#ec4899" },
  orange: { bg: "rgba(249, 115, 22, 0.12)", border: "#f97316" },
};

export default function HighlightsPage() {
  const [data, setData] = useState<KindleData | null>(null);
  const [activeBook, setActiveBook] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [extensionReady, setExtensionReady] = useState(false);

  // Load cached data
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) setData(JSON.parse(cached));
    } catch {}
  }, []);

  // Listen for extension messages
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window || !event.data?.type) return;

      switch (event.data.type) {
        case "marks:pong-extension":
          setExtensionReady(true);
          break;
        case "marks:kindle-sync-progress":
          setSyncMessage(event.data.message);
          break;
        case "marks:kindle-sync-error":
          setSyncing(false);
          setSyncMessage(event.data.error || "Sync failed");
          break;
        case "marks:kindle-sync-data": {
          const payload = event.data.payload as KindleData;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
          setData(payload);
          setSyncing(false);
          setSyncMessage("");
          break;
        }
      }
    }

    window.addEventListener("message", onMessage);

    // Check if extension is installed
    // The MAIN world script sets window.__marks_extension
    if ((window as any).__marks_extension) {
      setExtensionReady(true);
    }
    // Also ping via postMessage
    window.postMessage({ type: "marks:ping-extension" }, "*");

    return () => window.removeEventListener("message", onMessage);
  }, []);

  function startSync() {
    if (syncing) return;
    if (!extensionReady) return;
    setSyncing(true);
    setSyncMessage("Opening Amazon...");
    window.postMessage({ type: "marks:kindle-start-sync" }, "*");
  }

  const books = useMemo(() => {
    if (!data) return [];
    return data.books
      .filter((b) => b.highlights && b.highlights.length > 0)
      .sort((a, b) => b.highlights.length - a.highlights.length);
  }, [data]);

  const filteredBooks = useMemo(() => {
    if (!search) return books;
    const q = search.toLowerCase();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.highlights.some(
          (h) =>
            h.text.toLowerCase().includes(q) ||
            (h.note && h.note.toLowerCase().includes(q))
        )
    );
  }, [books, search]);

  const selectedBook = activeBook !== null ? books[activeBook] : null;

  const filteredHighlights = useMemo(() => {
    if (!selectedBook) return [];
    if (!search) return selectedBook.highlights;
    const q = search.toLowerCase();
    return selectedBook.highlights.filter(
      (h) =>
        h.text.toLowerCase().includes(q) ||
        (h.note && h.note.toLowerCase().includes(q))
    );
  }, [selectedBook, search]);

  const totalHighlights = books.reduce(
    (sum, b) => sum + b.highlights.length,
    0
  );

  const syncDotColor = !data
    ? "var(--text-faint)"
    : (() => {
        const days = Math.floor(
          (Date.now() - new Date(data.exportedAt).getTime()) / 86400000
        );
        if (days <= 7) return "#6ee7b7";
        if (days <= 30) return "#fcd34d";
        return "#fca5a5";
      })();

  const syncLabel = !data
    ? "Not synced yet"
    : (() => {
        const days = Math.floor(
          (Date.now() - new Date(data.exportedAt).getTime()) / 86400000
        );
        if (days === 0) return "Synced today";
        if (days === 1) return "Synced yesterday";
        return `Synced ${days}d ago`;
      })();

  // No data and no extension — show install prompt
  if (!data && !extensionReady) {
    return (
      <div className="container">
        <Header />
        <div className="empty">
          <p style={{ marginBottom: "1rem" }}>
            <strong>Kindle Highlights</strong>
          </p>
          <p>
            Install the{" "}
            <a
              href="https://github.com/crxnamja/marks"
              target="_blank"
              rel="noopener noreferrer"
            >
              Marks Chrome extension
            </a>{" "}
            to sync your Kindle highlights.
          </p>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-faint)",
              marginTop: "0.5rem",
            }}
          >
            The extension uses your existing Amazon login. No passwords shared.
          </p>
        </div>
      </div>
    );
  }

  // No data but extension ready — show sync button
  if (!data && extensionReady) {
    return (
      <div className="container">
        <Header />
        <div className="empty">
          <p style={{ marginBottom: "0.5rem" }}>
            <strong>Ready to sync</strong>
          </p>
          <p style={{ marginBottom: "1rem" }}>
            Click below to import your Kindle highlights from Amazon.
          </p>
          <button
            onClick={startSync}
            disabled={syncing}
            style={{
              padding: "0.5rem 1.5rem",
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: "5px",
              fontSize: "0.9375rem",
              fontWeight: 500,
              cursor: syncing ? "not-allowed" : "pointer",
              opacity: syncing ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {syncing ? syncMessage || "Syncing..." : "Sync Now"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 320,
          minWidth: 320,
          height: "100vh",
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: "20px 16px 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <Link
              href="/highlights"
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--text)",
                textDecoration: "none",
                letterSpacing: "-0.01em",
              }}
            >
              Kindle Highlights
            </Link>
            <Link
              href="/"
              style={{
                fontSize: "0.75rem",
                color: "var(--text-faint)",
              }}
            >
              &larr; Marks
            </Link>
          </div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {books.length} books &middot; {totalHighlights.toLocaleString()}{" "}
            highlights
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              fontSize: "0.6875rem",
              color: "var(--text-faint)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: syncing ? "#fcd34d" : syncDotColor,
                flexShrink: 0,
              }}
            />
            <span>{syncing ? syncMessage || "Syncing..." : syncLabel}</span>
          </div>
          {extensionReady && (
            <button
              onClick={startSync}
              disabled={syncing}
              style={{
                marginTop: 4,
                fontSize: "0.6875rem",
                color: "var(--accent)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: syncing ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: syncing ? 0.5 : 1,
              }}
            >
              {syncing ? "Syncing..." : "Sync now \u2192"}
            </button>
          )}
        </div>

        {/* Search */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <input
            type="text"
            placeholder="Search books & highlights..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 10px",
              border: "1px solid var(--border)",
              borderRadius: 5,
              fontSize: "0.8125rem",
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>

        {/* Book list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {filteredBooks.map((book, i) => {
            const realIndex = books.indexOf(book);
            const isActive = realIndex === activeBook;
            return (
              <div
                key={book.asin}
                onClick={() => setActiveBook(realIndex)}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  borderLeft: isActive
                    ? "3px solid var(--accent)"
                    : "3px solid transparent",
                  background: isActive ? "var(--tag-bg)" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                {book.cover ? (
                  <img
                    src={book.cover}
                    alt=""
                    loading="lazy"
                    style={{
                      width: 36,
                      minWidth: 36,
                      height: 52,
                      objectFit: "cover",
                      borderRadius: 3,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 36,
                      minWidth: 36,
                      height: 52,
                      borderRadius: 3,
                      background: "var(--border)",
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {book.title}
                  </div>
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--text-muted)",
                      marginTop: 1,
                    }}
                  >
                    {book.author}
                  </div>
                  <div
                    style={{
                      fontSize: "0.625rem",
                      color: "var(--accent)",
                      marginTop: 1,
                    }}
                  >
                    {book.highlights.length} highlight
                    {book.highlights.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          height: "100vh",
          overflowY: "auto",
          padding: "40px 56px",
        }}
      >
        {!selectedBook ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "50vh",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "1.125rem", fontWeight: 500, color: "var(--text)" }}>
              Your Kindle Highlights
            </p>
            <p style={{ fontSize: "0.875rem", marginTop: 4 }}>
              Select a book from the sidebar.
            </p>
          </div>
        ) : (
          <>
            {/* Book header */}
            <div
              style={{
                display: "flex",
                gap: 20,
                alignItems: "flex-start",
                marginBottom: 32,
                paddingBottom: 20,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {selectedBook.cover && (
                <img
                  src={selectedBook.cover}
                  alt=""
                  style={{
                    width: 72,
                    height: "auto",
                    borderRadius: 4,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }}
                />
              )}
              <div>
                <h2
                  style={{
                    fontSize: "1.375rem",
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.3,
                  }}
                >
                  {selectedBook.title}
                </h2>
                <div
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-muted)",
                    marginTop: 2,
                    fontStyle: "italic",
                    fontFamily: "var(--font-serif)",
                  }}
                >
                  {selectedBook.author}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-faint)",
                    marginTop: 6,
                  }}
                >
                  {filteredHighlights.length} highlight
                  {filteredHighlights.length !== 1 ? "s" : ""}
                  {search &&
                    filteredHighlights.length !== selectedBook.highlights.length &&
                    ` (filtered from ${selectedBook.highlights.length})`}
                </div>
              </div>
            </div>

            {/* Highlights */}
            {filteredHighlights.map((h, i) => {
              const colors = HIGHLIGHT_COLORS[h.color] || {
                bg: "var(--bg-surface)",
                border: "var(--border)",
              };
              return (
                <div
                  key={i}
                  style={{
                    marginBottom: 20,
                    padding: "16px 20px",
                    borderRadius: 6,
                    borderLeft: `3px solid ${colors.border}`,
                    background: colors.bg,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: "1rem",
                      lineHeight: 1.7,
                      color: "var(--text)",
                    }}
                  >
                    {h.text}
                  </div>
                  {(h.location || h.page) && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: "0.6875rem",
                        color: "var(--text-faint)",
                      }}
                    >
                      {[
                        h.location ? `Location: ${h.location}` : null,
                        h.page ? `Page: ${h.page}` : null,
                      ]
                        .filter(Boolean)
                        .join(" \u00b7 ")}
                    </div>
                  )}
                  {h.note && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 12px",
                        background: "rgba(0,0,0,0.04)",
                        borderRadius: 4,
                        fontSize: "0.8125rem",
                        fontStyle: "italic",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontStyle: "normal" }}>
                        Note:{" "}
                      </span>
                      {h.note}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredHighlights.length === 0 && search && (
              <p style={{ color: "var(--text-muted)", marginTop: 16 }}>
                No highlights matching &ldquo;{search}&rdquo; in this book.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header>
      <h1>Highlights</h1>
      <nav>
        <Link href="/">all</Link>
        <Link href="/read">read later</Link>
        <Link href="/actions">actions</Link>
        <Link href="/stats">stats</Link>
        <Link href="/highlights">highlights</Link>
        <Link href="/add" className="nav-add">
          + add
        </Link>
        <Link href="/settings" className="nav-settings">
          ⚙
        </Link>
      </nav>
    </header>
  );
}
