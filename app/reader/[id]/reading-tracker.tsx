"use client";

import { useEffect, useRef } from "react";

export function ReadingTracker({
  bookmarkId,
  wordCount,
}: {
  bookmarkId: number;
  wordCount: number;
}) {
  const sessionId = useRef<number | null>(null);
  const startTime = useRef(Date.now());
  const lastPing = useRef(Date.now());

  useEffect(() => {
    // Start a reading session
    async function startSession() {
      try {
        const res = await fetch("/api/reading-stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookmark_id: bookmarkId,
            word_count: wordCount,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          sessionId.current = data.session_id;
        }
      } catch {
        // Silently fail — stats are optional
      }
    }

    startSession();

    // Periodically update duration (every 30s)
    const interval = setInterval(() => {
      ping(false);
    }, 30000);

    // Update on page hide (leaving/closing)
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        ping(false);
      }
    }

    function handleBeforeUnload() {
      ping(false);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      ping(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkId, wordCount]);

  function ping(finished: boolean) {
    if (!sessionId.current) return;
    const elapsed = Math.round((Date.now() - startTime.current) / 1000);

    // Use sendBeacon for reliability on page close
    const body = JSON.stringify({
      bookmark_id: bookmarkId,
      session_id: sessionId.current,
      duration_seconds: elapsed,
      word_count: wordCount,
      finished,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/reading-stats",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      fetch("/api/reading-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }

    lastPing.current = Date.now();
  }

  // This component renders nothing — it's purely for tracking
  return null;
}
