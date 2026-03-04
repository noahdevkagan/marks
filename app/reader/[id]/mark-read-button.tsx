"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReaderMarkReadButton({
  bookmarkId,
  isRead,
}: {
  bookmarkId: number;
  isRead: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [read, setRead] = useState(isRead);

  async function toggle() {
    setLoading(true);
    const newValue = !read;
    await fetch(`/api/bookmarks/${bookmarkId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_read: newValue }),
    });
    setRead(newValue);
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      className={`reader-action-btn ${read ? "reader-read-done" : ""}`}
      onClick={toggle}
      disabled={loading}
    >
      {loading ? "..." : read ? "read" : "mark read"}
    </button>
  );
}
