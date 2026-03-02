"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function archive(forceArchive = false) {
    setLoading(true);
    setError("");
    setStatus(forceArchive ? "Fetching via archive.ph…" : "Extracting…");

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
      {isArchived && source !== "archive.ph" && (
        <button className="reader-action-btn" onClick={() => archive(true)}>
          try archive.ph
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
