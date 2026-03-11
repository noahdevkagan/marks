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

function mergeKindleData(
  prev: KindleData | null,
  incoming: KindleData,
): KindleData {
  if (!prev) return incoming;
  const updatedAsins = new Set(incoming.books.map((b) => b.asin));
  // Keep books that weren't re-scraped (unchanged), add all incoming
  const kept = prev.books.filter((b) => !updatedAsins.has(b.asin));
  return {
    exportedAt: incoming.exportedAt,
    books: [...incoming.books, ...kept],
  };
}

const HIGHLIGHT_COLORS: Record<string, { bg: string; border: string }> = {
  yellow: { bg: "rgba(250, 204, 21, 0.15)", border: "#eab308" },
  blue: { bg: "rgba(59, 130, 246, 0.12)", border: "#3b82f6" },
  pink: { bg: "rgba(236, 72, 153, 0.12)", border: "#ec4899" },
  orange: { bg: "rgba(249, 115, 22, 0.12)", border: "#f97316" },
};

async function saveToServer(kindleData: KindleData): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/kindle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: kindleData }),
      });
      if (res.ok) return true;
    } catch {
      // Network error — retry once
    }
  }
  return false;
}

async function loadFromServer(): Promise<{ data: KindleData | null; error?: string }> {
  try {
    const res = await fetch("/api/kindle");
    if (res.status === 401) return { data: null, error: "auth" };
    if (!res.ok) return { data: null, error: "server" };
    const json = await res.json();
    return { data: json.data ?? null };
  } catch {
    return { data: null, error: "network" };
  }
}

export default function KindlePage() {
  const [data, setData] = useState<KindleData | null>(null);
  const [activeBook, setActiveBook] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [extensionReady, setExtensionReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  // Load data: try localStorage first, then fetch from server
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try localStorage first (instant)
      let localData: KindleData | null = null;
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) localData = JSON.parse(cached);
      } catch {}

      if (localData) {
        setData(localData);
        setLoaded(true);
        return;
      }

      // No local data — fetch from server (cross-device sync)
      const result = await loadFromServer();
      if (cancelled) return;

      if (result.error) {
        setServerError(result.error);
      }
      if (result.data) {
        setData(result.data);
        // Cache locally for next time
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
        } catch {}
      }
      setLoaded(true);
    }

    load();
    return () => { cancelled = true; };
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
          // Merge with existing data: updated/new books from payload, keep unchanged ones
          setData((prev) => {
            const merged = mergeKindleData(prev, payload);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            saveToServer(merged).then((ok) => {
              if (!ok) setSaveFailed(true);
            });
            return merged;
          });
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
    // Pass existing books so the extension can skip unchanged ones
    const existingBooks = data
      ? data.books.map((b) => ({ asin: b.asin, highlightCount: b.highlights.length }))
      : [];
    window.postMessage({ type: "marks:kindle-start-sync", existingBooks }, "*");
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

  // Still loading — show nothing to avoid flash
  if (!loaded) {
    return (
      <div className="container">
        <Nav />
      </div>
    );
  }

  // No data and no extension — show appropriate message
  if (!data && !extensionReady) {
    return (
      <div className="container">
        <Nav />
        {serverError === "auth" ? (
          <div className="empty">
            <p>Please sign in to view your Kindle highlights.</p>
          </div>
        ) : serverError === "network" || serverError === "server" ? (
          <div className="empty">
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>Couldn&apos;t load highlights</strong>
            </p>
            <p style={{ marginBottom: "1rem" }}>
              Failed to reach the server. Check your connection and reload.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="kindle-sync-btn"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="kindle-install">
            <h2 className="kindle-install-title">Kindle Highlights</h2>
            <p className="kindle-install-subtitle">
              Sync your Kindle highlights by installing the Marks extension.
            </p>

            <ol className="kindle-install-steps">
              <li>
                <strong>Download the extension</strong>
                <p>
                  <a
                    href="/marks-extension.zip"
                    download
                    className="kindle-sync-btn"
                  >
                    Download marks-extension.zip
                  </a>
                </p>
              </li>
              <li>
                <strong>Unzip the file</strong>
                <p>Double-click the downloaded file to extract it.</p>
              </li>
              <li>
                <strong>Open Chrome Extensions</strong>
                <p>
                  Go to{" "}
                  <code className="kindle-install-code">
                    chrome://extensions
                  </code>{" "}
                  and turn on <strong>Developer mode</strong> in the top right.
                </p>
              </li>
              <li>
                <strong>Load the extension</strong>
                <p>
                  Click <strong>Load unpacked</strong> and select the unzipped
                  folder. Then reload this page.
                </p>
              </li>
            </ol>

            <p className="kindle-install-note">
              The extension uses your existing Amazon login. No passwords shared.
            </p>

            <p className="kindle-install-note" style={{ marginTop: "0.5rem" }}>
              Already synced on another device? Try reloading this page.
            </p>
          </div>
        )}
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

      {/* Save failure warning */}
      {saveFailed && (
        <div className="kindle-save-warning">
          Highlights saved locally but failed to sync to server. They
          won&apos;t appear on other devices.{" "}
          <button
            className="kindle-sync-link"
            onClick={() => {
              setSaveFailed(false);
              saveToServer(data!).then((ok) => {
                if (!ok) setSaveFailed(true);
              });
            }}
          >
            Retry
          </button>
        </div>
      )}

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
