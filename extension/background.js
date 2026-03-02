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
    // Open popup for login
    chrome.action.openPopup();
    return;
  }

  const url = info.menuItemId === "save-link" ? info.linkUrl : tab?.url;
  const title = info.menuItemId === "save-link" ? info.linkUrl : tab?.title;

  if (!url) return;

  try {
    const res = await fetch(`${API_URL}/api/bookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        url,
        title: title || url,
        is_read: false,
      }),
    });

    if (res.status === 401) {
      // Token expired — try refresh
      const refreshed = await refreshToken(config);
      if (refreshed) {
        // Retry with new token
        const retry = await fetch(`${API_URL}/api/bookmarks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${refreshed}`,
          },
          body: JSON.stringify({ url, title: title || url, is_read: false }),
        });
        if (!retry.ok) throw new Error("Save failed");
      } else {
        chrome.action.openPopup();
        return;
      }
    } else if (!res.ok) {
      throw new Error("Save failed");
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
      if (!token) return { ok: false, error: "Session expired" };
      res = await fetch(`${API_URL}/api/bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
    }

    if (!res.ok) return { ok: false, error: "Save failed" };
    const bookmark = await res.json();

    // Fire-and-forget: capture page HTML and archive it
    captureAndArchive(bookmark.id, token).catch(() => {});

    return { ok: true, bookmark };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function captureAndArchive(bookmarkId, token) {
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

    if (!res.ok) return null;
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
