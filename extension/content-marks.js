// Content script for getmarks.sh reader pages
// Bridges the web app and extension for archive.ph fetching via background tab

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "marks:fetch-archive") return;

  const { bookmarkId, url } = event.data;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "fetch-archive",
      bookmarkId,
      url,
    });

    window.postMessage({
      type: "marks:fetch-archive-result",
      ok: response?.ok ?? false,
      error: response?.error,
    });
  } catch (e) {
    window.postMessage({
      type: "marks:fetch-archive-result",
      ok: false,
      error: e.message,
    });
  }
});

// Signal to the page that the extension is available
window.postMessage({ type: "marks:extension-ready" });
