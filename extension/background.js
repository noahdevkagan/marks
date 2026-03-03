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
  if (msg.type === "fetch-archive") {
    fetchViaBackgroundTab(msg.url, msg.bookmarkId).then(sendResponse);
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

    const res = await fetch(`${API_URL}/api/bookmarks/${bookmarkId}/archive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ page_html: html }),
    });

    // If server-side extraction got thin/no content, try archive.ph via background tab
    if (!res.ok && url) {
      console.log("[Marks] Direct archive failed, trying archive.ph via background tab");
      await fetchViaBackgroundTab(url, bookmarkId);
    }
  } catch (e) {
    console.log("[Marks] captureAndArchive error:", e);
  }
}

async function fetchViaBackgroundTab(url, bookmarkId) {
  const config = await getConfig();
  let token = config.token;
  if (!token) return { ok: false, error: "Not logged in" };

  let tab;
  try {
    const archiveUrl = `https://archive.ph/newest/${url}`;
    tab = await chrome.tabs.create({ url: archiveUrl, active: false });

    // archive.ph has Cloudflare protection that fires multiple page loads:
    // 1. Challenge page loads → "complete"
    // 2. JS solves challenge, redirects → "complete"
    // 3. Actual archived page loads → "complete"
    // Wait until no new "complete" events for 3s (page has settled)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(); // try to capture whatever we have
      }, 45000);

      let settleTimer = null;

      function listener(tabId, changeInfo) {
        if (tabId !== tab.id) return;
        if (changeInfo.status === "complete") {
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timeout);
            resolve();
          }, 3000);
        }
      }

      chrome.tabs.onUpdated.addListener(listener);
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });

    await chrome.tabs.remove(tab.id).catch(() => {});
    tab = null;

    const html = results?.[0]?.result;
    if (!html || html.length < 500) {
      return { ok: false, error: "No content from archive.ph" };
    }

    // Check if we captured a CAPTCHA page instead of actual content
    if (html.includes("g-recaptcha") || html.includes("chk_captcha")) {
      return { ok: false, error: "archive.ph CAPTCHA — visit archive.ph in your browser first" };
    }

    let res = await fetch(`${API_URL}/api/bookmarks/${bookmarkId}/archive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ page_html: html }),
    });

    if (res.status === 401) {
      token = await refreshToken(config);
      if (!token) return { ok: false, error: "Session expired" };
      res = await fetch(`${API_URL}/api/bookmarks/${bookmarkId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ page_html: html }),
      });
    }

    if (!res.ok) return { ok: false, error: "Archive save failed" };
    return { ok: true };
  } catch (e) {
    if (tab) await chrome.tabs.remove(tab.id).catch(() => {});
    return { ok: false, error: e.message };
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
