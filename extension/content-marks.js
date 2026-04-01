// Content script for getmarks.sh reader pages (runs in ISOLATED world)
// The MAIN world script (content-marks-main.js) sets window.__marks_extension.
// This script handles message passing since only isolated world has chrome.runtime.

// --- Messages FROM the page (React) → extension background ---
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "marks:ping-extension") {
    window.postMessage({ type: "marks:pong-extension" });
    return;
  }

  // React asks us to prepare for an archive capture
  if (event.data?.type === "marks:prepare-archive") {
    try {
      await chrome.runtime.sendMessage({
        type: "prepare-archive",
        bookmarkId: event.data.bookmarkId,
        url: event.data.url,
      });
    } catch (e) {
      console.error("[Marks] prepare-archive failed:", e);
    }
    return;
  }

  // React asks us to open a URL and capture its HTML for archiving
  if (event.data?.type === "marks:capture-page") {
    try {
      await chrome.runtime.sendMessage({
        type: "capture-page",
        bookmarkId: event.data.bookmarkId,
        url: event.data.url,
      });
    } catch (e) {
      console.error("[Marks] capture-page failed:", e);
    }
    return;
  }

  // Highlights page asks to start Kindle sync
  if (event.data?.type === "marks:kindle-start-sync") {
    chrome.runtime.sendMessage({ type: "kindle-start-sync" });
    return;
  }
});

// --- Messages FROM the background → page (React) ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "archive-done") {
    window.postMessage({
      type: "marks:archive-done",
      ok: msg.ok,
      error: msg.error,
    });
  }
  // Kindle sync messages → relay to page
  if (msg.type === "marks:kindle-sync-data") {
    window.postMessage({ type: "marks:kindle-sync-data", payload: msg.payload });
  }
  if (msg.type === "marks:kindle-sync-progress") {
    window.postMessage({ type: "marks:kindle-sync-progress", message: msg.message });
  }
  if (msg.type === "marks:kindle-sync-error") {
    window.postMessage({ type: "marks:kindle-sync-error", error: msg.error });
  }
});
