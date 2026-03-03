"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function ArchiveActions({
  bookmarkId,
  isArchived,
  source,
}: {
  bookmarkId: number;
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

  async function archive(forceArchive = false) {
    setLoading(true);
    setError("");
    setStatus(forceArchive ? "Trying web archives…" : "Extracting…");

    try {
      const res = await fetch(`/api/bookmarks/${bookmarkId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force_archive: forceArchive }),
      });

      if (res.ok) {
        setStatus("");
        setLoading(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to extract");
        setStatus("");
        setLoading(false);
      }
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
