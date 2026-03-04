"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: Window & { __marks_extension?: boolean };

export function ArchiveActions({
  bookmarkId,
  bookmarkUrl,
  isArchived,
  source,
}: {
  bookmarkId: number;
  bookmarkUrl: string;
  isArchived: boolean;
  source?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(!isArchived);
  const [status, setStatus] = useState(!isArchived ? "Extracting…" : "");
  const [error, setError] = useState("");
  const autoTriggered = useRef(false);

  // Listen for archive capture completion from extension
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "marks:archive-done") return;
      setLoading(false);
      setStatus("");
      if (event.data.ok) {
        router.refresh();
      } else {
        setError(event.data.error ?? "Could not capture from archive.today");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    if (!isArchived && !autoTriggered.current) {
      autoTriggered.current = true;
      archive();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function prepareArchiveCapture() {
    // Tell extension to prepare for capture (stores bookmarkId + readerTabId)
    // content-archive.js will auto-capture when user lands on a snapshot page
    window.postMessage({
      type: "marks:prepare-archive",
      bookmarkId,
      url: bookmarkUrl,
    });
    setLoading(true);
    setStatus("Waiting for archive capture…");
  }

  async function archive() {
    setLoading(true);
    setError("");
    setStatus("Extracting…");

    try {
      const res = await fetch(`/api/bookmarks/${bookmarkId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force_archive: false }),
      });

      if (res.ok) {
        setStatus("");
        setLoading(false);
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to extract");
      setStatus("");
      setLoading(false);
    } catch {
      setError("Network error");
      setStatus("");
      setLoading(false);
    }
  }

  if (loading) {
    return <span className="archive-status">{status}</span>;
  }

  return (
    <>
      {error && <span className="archive-error">{error}</span>}
      {!isArchived && (
        <button className="reader-action-btn" onClick={() => archive()}>
          archive
        </button>
      )}
      {isArchived && source === "readability" && (
        <a
          className="reader-action-btn"
          href={`https://archive.today/newest/${encodeURIComponent(bookmarkUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={prepareArchiveCapture}
        >
          try web archive
        </a>
      )}
      {isArchived && (
        <button className="reader-action-btn" onClick={() => archive()}>
          re-extract
        </button>
      )}
    </>
  );
}
