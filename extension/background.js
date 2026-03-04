const API_URL = "https://marks-drab.vercel.app";

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-page",
    title: "Save page to Marks",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "save-link",
    title: "Save link to Marks",
    contexts: ["link"],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const config = await getConfig();
  if (!config.token) {
    chrome.action.openPopup();
    return;
  }

  const url = info.menuItemId === "save-link" ? info.linkUrl : tab?.url;
  let title = info.menuItemId === "save-link" ? info.linkUrl : tab?.title;

  if (!url) return;

  // Try og:title for better titles on paywalled pages
  if (info.menuItemId === "save-page" && tab?.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const og = document.querySelector('meta[property="og:title"]');
          return og?.getAttribute("content") || "";
        },
      });
      const ogTitle = results?.[0]?.result;
      if (ogTitle && ogTitle.length > 3) title = ogTitle;
    } catch {
      // scripting may fail on some pages
    }
  }

  try {
    let token = config.token;
    let res = await fetch(`${API_URL}/api/bookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url, title: title || url, is_read: false }),
    });

    if (res.status === 401) {
      token = await refreshToken(config);
      if (!token) {
        chrome.action.openPopup();
        return;
      }
      res = await fetch(`${API_URL}/api/bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, title: title || url, is_read: false }),
      });
    }

    if (!res.ok) throw new Error("Save failed");

    const bookmark = await res.json();

    // Capture page HTML and archive (for "save page", not "save link")
    if (info.menuItemId === "save-page" && tab?.id) {
      captureAndArchive(bookmark.id, token, url).catch(() => {});
    }

    // Show success badge briefly
    chrome.action.setBadgeText({ text: "✓", tabId: tab?.id });
    chrome.action.setBadgeBackgroundColor({ color: "#0066cc", tabId: tab?.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab?.id }), 2000);
  } catch {
    chrome.action.setBadgeText({ text: "!", tabId: tab?.id });
    chrome.action.setBadgeBackgroundColor({ color: "#cc3333", tabId: tab?.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab?.id }), 3000);
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "save-bookmark") {
    saveBookmark(msg.data).then(sendResponse);
    return true; // async
  }
  if (msg.type === "suggest-tags") {
    fetchSuggestedTags(msg.url).then(sendResponse);
    return true;
  }
  if (msg.type === "get-config") {
    getConfig().then(sendResponse);
    return true;
  }
  // Reader page asks us to prepare for an archive capture
  if (msg.type === "prepare-archive") {
    chrome.storage.local.set({
      pendingArchive: {
        bookmarkId: msg.bookmarkId,
        url: msg.url,
        readerTabId: sender.tab?.id,
      },
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  // Content script on archive.today captured the HTML
  if (msg.type === "archive-captured") {
    processArchiveCapture(msg, sender.tab?.id).then(sendResponse);
    return true;
  }
});

async function saveBookmark(data) {
  const config = await getConfig();
  if (!config.token) {
    return { ok: false, error: "Not logged in" };
  }

  try {
    let token = config.token;
    let res = await fetch(`${API_URL}/api/bookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (res.status === 401) {
      token = await refreshToken(config);
      if (!token) return { ok: false, error: "Session expired — please sign in again" };
      res = await fetch(`${API_URL}/api/bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.error || `Save failed (${res.status})` };
    }
    const bookmark = await res.json();

    // Fire-and-forget: capture page HTML and archive it
    captureAndArchive(bookmark.id, token, data.url).catch(() => {});

    return { ok: true, bookmark };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function captureAndArchive(bookmarkId, token, url) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });

    const html = results?.[0]?.result;
    if (!html || html.length < 500) return;

    await fetch(`${API_URL}/api/bookmarks/${bookmarkId}/archive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ page_html: html }),
    });
  } catch (e) {
    console.log("[Marks] captureAndArchive error:", e);
  }
}

// Called when content-archive.js on archive.today captures page HTML
async function processArchiveCapture(msg, archiveTabId) {
  const { pendingArchive } = await chrome.storage.local.get("pendingArchive");
  const readerTabId = pendingArchive?.readerTabId;
  const bookmarkId = msg.bookmarkId;

  await chrome.storage.local.remove("pendingArchive");

  // Close the archive.today tab and restore focus to reader
  if (archiveTabId) await chrome.tabs.remove(archiveTabId).catch(() => {});
  if (readerTabId) await chrome.tabs.update(readerTabId, { active: true }).catch(() => {});

  if (!msg.html || msg.html.length < 1000) {
    notifyReaderTab(readerTabId, false, "No content captured from archive page");
    return { ok: false };
  }

  const config = await getConfig();
  let token = config.token;
  if (!token) {
    notifyReaderTab(readerTabId, false, "Not logged in");
    return { ok: false };
  }

  try {
    let res = await fetch(`${API_URL}/api/bookmarks/${bookmarkId}/archive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ page_html: msg.html }),
    });

    if (res.status === 401) {
      token = await refreshToken(config);
      if (!token) {
        notifyReaderTab(readerTabId, false, "Session expired");
        return { ok: false };
      }
      res = await fetch(`${API_URL}/api/bookmarks/${bookmarkId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ page_html: msg.html }),
      });
    }

    const ok = res.ok;
    if (!ok) {
      const errData = await res.json().catch(() => ({}));
      notifyReaderTab(readerTabId, false, errData.error || "Extraction failed");
    } else {
      notifyReaderTab(readerTabId, true);
    }
    return { ok };
  } catch (e) {
    notifyReaderTab(readerTabId, false, e.message);
    return { ok: false };
  }
}

function notifyReaderTab(tabId, ok, error) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "archive-done", ok, error }).catch(() => {});
}

async function fetchSuggestedTags(url) {
  const config = await getConfig();
  if (!config.token) return { tags: [] };

  try {
    let token = config.token;
    let res = await fetch(
      `${API_URL}/api/suggest-tags?url=${encodeURIComponent(url)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (res.status === 401) {
      token = await refreshToken(config);
      if (!token) return { tags: [] };
      res = await fetch(
        `${API_URL}/api/suggest-tags?url=${encodeURIComponent(url)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    }

    if (!res.ok) return { tags: [] };
    return await res.json();
  } catch {
    return { tags: [] };
  }
}

async function getConfig() {
  const data = await chrome.storage.local.get([
    "token",
    "refreshToken",
    "supabaseUrl",
    "supabaseKey",
  ]);
  return data;
}

async function refreshToken(config) {
  if (!config.refreshToken || !config.supabaseUrl || !config.supabaseKey) {
    // No credentials — clear stale token so popup shows login
    await chrome.storage.local.remove(["token", "refreshToken"]);
    return null;
  }

  try {
    const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseKey,
      },
      body: JSON.stringify({ refresh_token: config.refreshToken }),
    });

    if (!res.ok) {
      // Refresh token expired — clear tokens so popup shows login
      await chrome.storage.local.remove(["token", "refreshToken"]);
      return null;
    }
    const data = await res.json();

    await chrome.storage.local.set({
      token: data.access_token,
      refreshToken: data.refresh_token,
    });

    return data.access_token;
  } catch {
    return null;
  }
}
