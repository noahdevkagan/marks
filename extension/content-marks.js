// Content script for getmarks.sh reader pages
// Bridges the web app and extension for archive.ph fetching via background tab
//
// NOTE: Content scripts run in an isolated world — they share the DOM but NOT
// the window JS context with the page. So we inject a <script> tag to set a
// property on the page's actual window object.

// Set flag on the page's real window (not the isolated content script window)
const marker = document.createElement("script");
marker.textContent = "window.__marks_extension = true;";
document.documentElement.appendChild(marker);
marker.remove();

// Also send postMessage (works cross-world via DOM)
window.postMessage({ type: "marks:extension-ready" });

// Listen for fetch-archive requests from the page
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "marks:ping-extension") {
    window.postMessage({ type: "marks:pong-extension" });
    return;
  }

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
