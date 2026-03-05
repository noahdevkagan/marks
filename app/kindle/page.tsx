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

export default function KindlePage() {
  const [data, setData] = useState<KindleData | null>(null);
  const [activeBook, setActiveBook] = useState<string | null>(null);
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

    if ((window as any).__marks_extension) {
      setExtensionReady(true);
    }
    window.postMessage({ type: "marks:ping-extension" }, "*");

    return () => window.removeEventListener("message", onMessage);
  }, []);

  function startSync() {
    if (syncing || !extensionReady) return;
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

  const selectedBook = activeBook
    ? books.find((b) => b.asin === activeBook) ?? null
    : null;

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
        <Nav />
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
        <Nav />
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
            className="kindle-sync-btn"
          >
            {syncing ? syncMessage || "Syncing..." : "Sync Now"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <Nav />

      {/* Sync bar */}
      <div className="kindle-sync-bar">
        <div className="kindle-sync-status">
          <span
            className="kindle-sync-dot"
            style={{
              background: syncing ? "#fcd34d" : syncDotColor,
            }}
          />
          <span>{syncing ? syncMessage || "Syncing..." : syncLabel}</span>
        </div>
        {extensionReady && (
          <button
            onClick={startSync}
            disabled={syncing}
            className="kindle-sync-link"
          >
            {syncing ? "Syncing..." : "Sync now \u2192"}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder={
            selectedBook
              ? "Search highlights..."
              : "Search books & highlights..."
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {selectedBook ? (
        /* Book detail view */
        <>
          <button
            onClick={() => {
              setActiveBook(null);
              setSearch("");
            }}
            className="kindle-back-link"
          >
            &larr; All books
          </button>

          <div className="kindle-book-header">
            {selectedBook.cover ? (
              <img
                src={selectedBook.cover}
                alt=""
                className="kindle-book-header-cover"
              />
            ) : (
              <div className="kindle-book-header-cover kindle-no-cover" />
            )}
            <div>
              <h2 className="kindle-book-title">{selectedBook.title}</h2>
              <div className="kindle-book-author">{selectedBook.author}</div>
              <div className="kindle-book-count">
                {filteredHighlights.length} highlight
                {filteredHighlights.length !== 1 ? "s" : ""}
                {search &&
                  filteredHighlights.length !==
                    selectedBook.highlights.length &&
                  ` (filtered from ${selectedBook.highlights.length})`}
              </div>
            </div>
          </div>

          {filteredHighlights.map((h, i) => {
            const colors = HIGHLIGHT_COLORS[h.color] || {
              bg: "var(--bg-surface)",
              border: "var(--border)",
            };
            return (
              <div
                key={i}
                className="kindle-highlight"
                style={{
                  borderLeftColor: colors.border,
                  background: colors.bg,
                }}
              >
                <div className="kindle-highlight-text">{h.text}</div>
                {(h.location || h.page) && (
                  <div className="kindle-highlight-meta">
                    {[
                      h.location ? `Location: ${h.location}` : null,
                      h.page ? `Page: ${h.page}` : null,
                    ]
                      .filter(Boolean)
                      .join(" \u00b7 ")}
                  </div>
                )}
                {h.note && (
                  <div className="kindle-highlight-note">
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
            <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>
              No highlights matching &ldquo;{search}&rdquo; in this book.
            </p>
          )}
        </>
      ) : (
        /* Book list view */
        <>
          <p className="read-count">
            {filteredBooks.length} book{filteredBooks.length !== 1 ? "s" : ""}{" "}
            &middot; {totalHighlights.toLocaleString()} highlights
          </p>

          <ul className="bookmark-list">
            {filteredBooks.map((book) => (
              <li key={book.asin} className="bookmark-item">
                <div
                  className="bookmark-row"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setActiveBook(book.asin);
                    setSearch("");
                  }}
                >
                  {book.cover ? (
                    <img
                      src={book.cover}
                      alt=""
                      loading="lazy"
                      className="kindle-cover"
                    />
                  ) : (
                    <div className="kindle-cover kindle-no-cover" />
                  )}
                  <div className="bookmark-content">
                    <div className="bookmark-title">{book.title}</div>
                    <div className="bookmark-url">{book.author}</div>
                    <div className="bookmark-meta">
                      <span>
                        {book.highlights.length} highlight
                        {book.highlights.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {filteredBooks.length === 0 && search && (
            <div className="empty">
              <p>No books matching &ldquo;{search}&rdquo;.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Nav() {
  return (
    <header>
      <h1>
        <Link href="/">Marks</Link>
      </h1>
      <nav>
        <Link href="/">all</Link>
        <Link href="/read">read later</Link>
        <Link href="/actions">actions</Link>
        <Link href="/stats">stats</Link>
        <Link href="/kindle">kindle</Link>
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
