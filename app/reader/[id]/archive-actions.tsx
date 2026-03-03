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

  useEffect(() => {
    if (!isArchived && !autoTriggered.current) {
      autoTriggered.current = true;
      archive(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Check if extension is present right now via injected window property */
  function hasExtension(): boolean {
    return window.__marks_extension === true;
  }

  /** Ask extension to fetch URL via archive.ph background tab */
  async function fetchViaExtension(): Promise<{
    ok: boolean;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => resolve({ ok: false, error: "Timed out fetching from archive.ph" }),
        60000,
      );

      function onResult(event: MessageEvent) {
        if (event.data?.type !== "marks:fetch-archive-result") return;
        window.removeEventListener("message", onResult);
        clearTimeout(timeout);
        resolve({
          ok: event.data.ok === true,
          error: event.data.error,
        });
      }

      window.addEventListener("message", onResult);
      window.postMessage({
        type: "marks:fetch-archive",
        bookmarkId,
        url: bookmarkUrl,
      });
    });
  }

  async function archive(forceArchive = false) {
    setLoading(true);
    setError("");

    try {
      // "try web archive" with extension → go straight to extension
      if (forceArchive && hasExtension()) {
        setStatus("Fetching via archive.ph…");
        const result = await fetchViaExtension();
        if (result.ok) {
          setStatus("");
          setLoading(false);
          router.refresh();
          return;
        }
        setError(result.error ?? "Could not fetch from archive.ph");
        setStatus("");
        setLoading(false);
        return;
      }

      setStatus(forceArchive ? "Trying web archives…" : "Extracting…");

      const res = await fetch(`/api/bookmarks/${bookmarkId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force_archive: forceArchive }),
      });

      if (res.ok) {
        setStatus("");
        setLoading(false);
        router.refresh();
        return;
      }

      // Server-side failed — try via extension
      if (hasExtension()) {
        setStatus("Fetching via archive.ph…");
        const result = await fetchViaExtension();
        if (result.ok) {
          setStatus("");
          setLoading(false);
          router.refresh();
          return;
        }
        setError(result.error ?? "Could not fetch from archive.ph");
        setStatus("");
        setLoading(false);
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
        <button className="reader-action-btn" onClick={() => archive(false)}>
          archive
        </button>
      )}
      {isArchived && source === "readability" && (
        <button className="reader-action-btn" onClick={() => archive(true)}>
          try web archive
        </button>
      )}
      {isArchived && (
        <button className="reader-action-btn" onClick={() => archive(false)}>
          re-extract
        </button>
      )}
    </>
  );
}
