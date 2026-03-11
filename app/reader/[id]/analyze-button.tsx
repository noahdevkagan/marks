"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AnalyzeButton({ bookmarkId }: { bookmarkId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    const res = await fetch(`/api/bookmarks/${bookmarkId}/enrich`, {
      method: "POST",
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    }
  }

  return (
    <button
      className="reader-nav-link"
      onClick={analyze}
      disabled={loading}
    >
      {loading ? "analyzing..." : "analyze"}
    </button>
  );
}
