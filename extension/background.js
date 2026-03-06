const API_URL = "https://marks-drab.vercel.app";

function isTweetUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    return (host === "x.com" || host === "twitter.com") && u.pathname.includes("/status/");
  } catch { return false; }
}

/** Injected into the page to extract tweet or X Article text */
function extractTweetContentFromPage() {
  // Check for X Article (long-form)
  const articleReadView = document.querySelector('[data-testid="twitterArticleReadView"]');
  if (articleReadView) {
    const titleEl = document.querySelector('[data-testid="twitter-article-title"]');
    const articleTitle = titleEl?.textContent?.trim() || "";
    const raw = articleReadView.innerText;
    const lines = raw.split("\n");
    let startIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === articleTitle) { startIdx = i + 1; continue; }
      if (startIdx > 0 && /^[\d,.]+[KMB]?$/.test(line) && line.length < 10) { startIdx = i + 1; continue; }
      if (line.length > 20) break;
      if (startIdx > 0) startIdx = i + 1;
    }
    const bodyText = lines.slice(startIdx).join("\n").trim();
    let handle = "";
    const article = document.querySelector("article");
    if (article) {
      const links = article.querySelectorAll('a[role="link"]');
      for (const link of links) {
        const href = link.getAttribute("href") || "";
        if (href.match(/^\/\w+$/)) { handle = href.slice(1); break; }
      }
    }
    return { text: bodyText, title: articleTitle, handle, isArticle: true };
  }
  // Regular tweet
  const article = document.querySelector("article");
  if (!article) return null;
  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl?.textContent?.trim() || "";
  let handle = "";
  const links = article.querySelectorAll('a[role="link"]');
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    if (href.match(/^\/\w+$/)) { handle = href.slice(1); break; }
  }
  return { text, title: "", handle, isArticle: false };
}

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

  // Build save payload — extract tweet/article text if on x.com
  let saveBody = { url, title: title || url, is_read: false };

  if (info.menuItemId === "save-page" && tab?.id) {
    // For tweets, extract full text from the page DOM
    if (isTweetUrl(url)) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractTweetContentFromPage,
        });
        const data = results?.[0]?.result;
        if (data?.text) {
          saveBody = {
            url,
            title: data.title || title || url,
            description: data.text,
            is_read: false,
            type: "tweet",
            type_metadata: {
              author: data.handle,
              tweet_text: data.text,
              ...(data.isArticle && { x_article: true }),
            },
          };
        }
      } catch {
        // Fall through to default save
      }
    }

    // Try og:title for better titles on non-tweet pages
    if (!saveBody.description) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const og = document.querySelector('meta[property="og:title"]');
            return og?.getAttribute("content") || "";
          },
        });
        const ogTitle = results?.[0]?.result;
        if (ogTitle && ogTitle.length > 3) saveBody.title = ogTitle;
      } catch {
        // scripting may fail on some pages
      }
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
      body: JSON.stringify(saveBody),
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
        body: JSON.stringify(saveBody),
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
    saveBookmark(msg.data)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message || "Background worker error" }));
    return true; // async
  }
  if (msg.type === "suggest-tags") {
    fetchSuggestedTags(msg.url, msg.title)
      .then(sendResponse)
      .catch(() => sendResponse({ tags: [] }));
    return true;
  }
  if (msg.type === "get-config") {
    getConfig()
      .then(sendResponse)
      .catch(() => sendResponse({}));
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

async function fetchSuggestedTags(url, title) {
  const config = await getConfig();
  if (!config.token) return { tags: [] };

  try {
    let token = config.token;
    const params = new URLSearchParams({ url });
    if (title) params.set("title", title);
    let res = await fetch(
      `${API_URL}/api/suggest-tags?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (res.status === 401) {
      token = await refreshToken(config);
      if (!token) return { tags: [] };
      res = await fetch(
        `${API_URL}/api/suggest-tags?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    }

    if (!res.ok) return { tags: [] };
    return await res.json();
  } catch {
    return { tags: [] };
  }
}

// --- Kindle Highlights Sync ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "kindle-start-sync") {
    kindleStartSync(sender.tab?.id).then(sendResponse);
    return true;
  }
  if (msg.type === "kindle-check-scrape") {
    kindleCheckScrape(sender.tab?.id).then(sendResponse);
    return true;
  }
  if (msg.type === "kindle-scrape-complete") {
    kindleScrapeComplete(msg.payload).then(sendResponse);
    return true;
  }
  if (msg.type === "kindle-scrape-progress") {
    kindleRelayToApp({ type: "marks:kindle-sync-progress", message: msg.message });
    return false;
  }
  if (msg.type === "kindle-scrape-error") {
    kindleScrapeError(msg.error);
    return false;
  }
});

// Clean up if Amazon tab closed mid-sync
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { kindleSyncState } = await chrome.storage.local.get("kindleSyncState");
  if (kindleSyncState && kindleSyncState.amazonTabId === tabId) {
    kindleRelayToApp({ type: "marks:kindle-sync-error", error: "Amazon tab was closed during sync" });
    await chrome.storage.local.remove("kindleSyncState");
  }
});

async function kindleStartSync(appTabId) {
  const tab = await chrome.tabs.create({
    url: "https://read.amazon.com/notebook",
    active: true,
  });
  await chrome.storage.local.set({
    kindleSyncState: { syncPending: true, appTabId, amazonTabId: tab.id },
  });
  return { ok: true };
}

async function kindleCheckScrape(amazonTabId) {
  const { kindleSyncState } = await chrome.storage.local.get("kindleSyncState");
  if (kindleSyncState && kindleSyncState.syncPending && kindleSyncState.amazonTabId === amazonTabId) {
    return { shouldScrape: true };
  }
  return { shouldScrape: false };
}

async function kindleScrapeComplete(payload) {
  const { kindleSyncState } = await chrome.storage.local.get("kindleSyncState");
  if (!kindleSyncState) return { ok: false };

  await kindleRelayToApp({ type: "marks:kindle-sync-data", payload });

  try { await chrome.tabs.remove(kindleSyncState.amazonTabId); } catch {}
  try { await chrome.tabs.update(kindleSyncState.appTabId, { active: true }); } catch {}

  await chrome.storage.local.remove("kindleSyncState");
  return { ok: true };
}

async function kindleScrapeError(error) {
  await kindleRelayToApp({ type: "marks:kindle-sync-error", error });

  const { kindleSyncState } = await chrome.storage.local.get("kindleSyncState");
  if (kindleSyncState) {
    try { await chrome.tabs.remove(kindleSyncState.amazonTabId); } catch {}
    try { await chrome.tabs.update(kindleSyncState.appTabId, { active: true }); } catch {}
  }
  await chrome.storage.local.remove("kindleSyncState");
}

async function kindleRelayToApp(message) {
  const { kindleSyncState } = await chrome.storage.local.get("kindleSyncState");
  if (!kindleSyncState || !kindleSyncState.appTabId) return;
  try {
    await chrome.tabs.sendMessage(kindleSyncState.appTabId, message);
  } catch {}
}

// --- Config helpers ---

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
