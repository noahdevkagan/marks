const API_URL = "https://marks-drab.vercel.app";

function isTweetUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    return (host === "x.com" || host === "twitter.com") && u.pathname.includes("/status/");
  } catch { return false; }
}

/** Injected into the page to extract tweet or X Article text + HTML */
function extractTweetContentFromPage() {
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function cleanImgSrc(src) {
    try { const u = new URL(src); return u.origin + u.pathname + "?format=jpg&name=large"; }
    catch { return src; }
  }
  function getInlineStyle(node, stopAt) {
    let isBold = false, isItalic = false;
    let el = node.parentElement;
    while (el && el !== stopAt) {
      const style = el.getAttribute("style") || "";
      if (style.includes("font-weight")) isBold = true;
      if (style.includes("font-style")) isItalic = true;
      el = el.parentElement;
    }
    return { isBold, isItalic };
  }
  function processInline(el) {
    let html = "";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent;
      if (!text) continue;
      const { isBold, isItalic } = getInlineStyle(node, el);
      let escaped = esc(text);
      if (isBold && isItalic) escaped = "<strong><em>" + escaped + "</em></strong>";
      else if (isBold) escaped = "<strong>" + escaped + "</strong>";
      else if (isItalic) escaped = "<em>" + escaped + "</em>";
      html += escaped;
    }
    return html;
  }
  function findContentContainer(el, depth) {
    if (depth > 10) return null;
    for (const child of el.children) {
      if (child.children.length > 10) return child;
      const found = findContentContainer(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  function extractTweetTextHtml(textEl) {
    function walk(parent) {
      let html = "";
      for (const node of parent.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          html += esc(node.textContent || "");
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node;
          if (el.tagName === "BR") {
            html += "<br>";
          } else if (el.tagName === "IMG") {
            html += el.alt || "";
          } else if (el.tagName === "A" || el.querySelector("a")) {
            const a = el.tagName === "A" ? el : el.querySelector("a");
            const href = a?.getAttribute("href") || "";
            const text = el.textContent || "";
            const fullHref = href.startsWith("/") ? "https://x.com" + href : href;
            html += '<a href="' + esc(fullHref) + '">' + esc(text) + "</a>";
          } else {
            html += walk(el);
          }
        }
      }
      return html;
    }
    return "<p>" + walk(textEl) + "</p>";
  }

  function getHandle(articleEl) {
    if (!articleEl) return "";
    const links = articleEl.querySelectorAll('a[role="link"]');
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      if (href.match(/^\/\w+$/)) return href.slice(1);
    }
    return "";
  }

  // Check for X Article (long-form)
  const articleReadView = document.querySelector('[data-testid="twitterArticleReadView"]');
  if (articleReadView) {
    const titleEl = document.querySelector('[data-testid="twitter-article-title"]');
    const articleTitle = titleEl?.textContent?.trim() || "";
    const article = document.querySelector("article");
    const handle = getHandle(article);

    const container = findContentContainer(articleReadView, 0);
    let contentHtml = "";
    const mediaUrls = [];

    if (container) {
      const blocks = [];
      const headerImg = articleReadView.children[0]?.querySelector("img");
      if (headerImg?.src?.includes("pbs.twimg.com")) {
        const src = cleanImgSrc(headerImg.src);
        blocks.push('<img src="' + esc(src) + '" alt="Article header" />');
        mediaUrls.push(src);
      }
      for (const child of container.children) {
        const tag = child.tagName;
        if (tag === "BLOCKQUOTE") {
          blocks.push("<blockquote>" + esc(child.textContent?.trim() || "") + "</blockquote>");
          continue;
        }
        if (tag === "SECTION") {
          const pre = child.querySelector("pre");
          if (pre) { blocks.push("<pre><code>" + esc(pre.textContent || "") + "</code></pre>"); continue; }
          const img = child.querySelector("img");
          if (img?.src?.includes("pbs.twimg.com")) {
            const src = cleanImgSrc(img.src);
            blocks.push('<img src="' + esc(src) + '" alt="' + esc(img.alt || "") + '" />');
            mediaUrls.push(src);
            continue;
          }
          const text = child.textContent?.trim();
          if (text) blocks.push("<p>" + esc(text) + "</p>");
          continue;
        }
        if (tag === "UL") {
          const items = [...child.querySelectorAll("li")].map(li => "<li>" + processInline(li) + "</li>");
          blocks.push("<ul>" + items.join("") + "</ul>");
          continue;
        }
        const h2 = child.querySelector("h2");
        if (h2) { blocks.push("<h2>" + esc(h2.textContent?.trim() || "") + "</h2>"); continue; }
        const img = child.querySelector("img");
        if (img?.src?.includes("pbs.twimg.com")) {
          const src = cleanImgSrc(img.src);
          blocks.push('<img src="' + esc(src) + '" alt="' + esc(img.alt || "") + '" />');
          mediaUrls.push(src);
          continue;
        }
        const text = child.textContent?.trim();
        if (!text) continue;
        blocks.push("<p>" + processInline(child) + "</p>");
      }
      contentHtml = blocks.join("\n");
    }

    const bodyText = articleReadView.innerText?.trim() || "";
    return { text: bodyText, contentHtml, title: articleTitle, handle, isArticle: true, mediaUrls };
  }

  // Regular tweet
  const article = document.querySelector("article");
  if (!article) return null;
  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl?.textContent?.trim() || "";
  const handle = getHandle(article);

  let contentHtml = "";
  if (textEl) {
    contentHtml = extractTweetTextHtml(textEl);
    // Append media images
    const imgs = article.querySelectorAll('img[src*="pbs.twimg.com"]');
    for (const img of imgs) {
      if (!img.src.includes("profile_images")) {
        contentHtml += '\n<img src="' + esc(cleanImgSrc(img.src)) + '" alt="Tweet media" />';
      }
    }
  }

  return { text, contentHtml, title: "", handle, isArticle: false };
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
              content_html: data.contentHtml || "",
              media_urls: data.mediaUrls || [],
              ...(data.isArticle && { x_article: true }),
            },
          };
        }
      } catch {
        // Fall through to default save
      }
    }

    // Try og:title for better titles on non-tweet pages, or first line for LinkedIn
    if (!saveBody.description) {
      try {
        const isLinkedIn = /linkedin\.com/.test(url);
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (isLI) => {
            if (isLI) {
              const selectors = [
                '.feed-shared-update-v2__description',
                '.update-components-text',
                '[data-ad-preview="message"]',
                '.break-words',
                '.feed-shared-update-v2 .break-words',
                '.feed-shared-inline-show-more-text',
                '.attributed-text-segment-list__content',
              ];
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                  const text = el.innerText?.trim() || "";
                  const firstLine = text.split('\n').find(l => l.trim().length > 0) || "";
                  if (firstLine.length > 3) {
                    return firstLine.length > 120 ? firstLine.slice(0, 117) + "..." : firstLine;
                  }
                }
              }
              const allSpans = document.querySelectorAll('span[dir="ltr"], span.break-words, div.break-words');
              let best = "";
              for (const span of allSpans) {
                const t = span.innerText?.trim() || "";
                if (t.length > best.length && t.length > 20) best = t;
              }
              if (best) {
                const firstLine = best.split('\n').find(l => l.trim().length > 0) || "";
                if (firstLine.length > 3) {
                  return firstLine.length > 120 ? firstLine.slice(0, 117) + "..." : firstLine;
                }
              }
            }
            const og = document.querySelector('meta[property="og:title"]');
            const ogContent = og?.getAttribute("content") || "";
            if (ogContent && !["Home", "Feed", "LinkedIn"].includes(ogContent)) return ogContent;
            return "";
          },
          args: [isLinkedIn],
        });
        const extractedTitle = results?.[0]?.result;
        if (extractedTitle && extractedTitle.length > 3) saveBody.title = extractedTitle;
      } catch {
        // scripting may fail on some pages
      }
    }
  }

  try {
    // Detect tweet URLs and add type metadata
    const bookmarkData = { url, title: title || url, is_read: false };
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace("www.", "");
      if ((host === "x.com" || host === "twitter.com") && parsed.pathname.includes("/status/")) {
        bookmarkData.type = "tweet";
        const parts = parsed.pathname.split("/");
        if (parts[1]) bookmarkData.type_metadata = { author: parts[1] };
      }
    } catch {}

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
  if (msg.type === "check-existing") {
    checkExistingBookmark(msg.url)
      .then(sendResponse)
      .catch(() => sendResponse({ exists: false }));
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
  // Reader page asks us to open a URL, capture its HTML, and archive it
  if (msg.type === "capture-page") {
    captureFromUrl(msg.bookmarkId, msg.url, sender.tab?.id).then(sendResponse);
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

// Called from reader page: open URL in new tab, capture rendered HTML, archive it
async function captureFromUrl(bookmarkId, url, readerTabId) {
  try {
    const config = await getConfig();
    let token = config.token;
    if (!token) return { ok: false, error: "Not logged in" };

    // Try direct page capture first, then fall back to archive.ph
    const result = await captureTabHtml(url);

    if (result) {
      const archiveResult = await sendToArchive(bookmarkId, token, result, config);
      if (archiveResult.ok) {
        notifyReaderTab(readerTabId, true);
        return { ok: true };
      }
    }

    // Direct capture failed or produced no usable content — try archive.ph
    console.log("[Marks] Direct capture failed, trying archive.ph…");
    const archivePhUrl = `https://archive.ph/newest/${encodeURI(url)}`;
    const archiveHtml = await captureTabHtml(archivePhUrl);

    if (archiveHtml) {
      // Strip archive.ph toolbar/chrome before sending
      const cleaned = archiveHtml
        .replace(/<div id="HEADER"[\s\S]*?<\/div>\s*<!-- \/HEADER -->/i, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "");

      const archiveResult = await sendToArchive(bookmarkId, token, cleaned, config);
      if (archiveResult.ok) {
        notifyReaderTab(readerTabId, true);
        return { ok: true };
      }
    }

    notifyReaderTab(readerTabId, false, "Could not extract from page or archive");
    return { ok: false, error: "All capture methods failed" };
  } catch (e) {
    console.error("[Marks] captureFromUrl error:", e);
    notifyReaderTab(readerTabId, false, e.message);
    return { ok: false, error: e.message };
  }
}

// Open a URL in a background tab, wait for load, capture HTML, close tab
async function captureTabHtml(url) {
  try {
    const tab = await chrome.tabs.create({ url, active: false });

    const loaded = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(false);
      }, 30000);

      function listener(tabId, info) {
        if (tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          resolve(true);
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });

    if (!loaded) {
      await chrome.tabs.remove(tab.id).catch(() => {});
      return null;
    }

    // Small delay for JS-rendered content to settle
    await new Promise((r) => setTimeout(r, 2000));

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });

    await chrome.tabs.remove(tab.id).catch(() => {});

    const html = results?.[0]?.result;
    if (!html || html.length < 500) return null;

    return html;
  } catch (e) {
    console.error("[Marks] captureTabHtml error:", e);
    return null;
  }
}

// Send captured HTML to the archive endpoint, handle 401 retry
async function sendToArchive(bookmarkId, token, html, config) {
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
    if (token) {
      res = await fetch(`${API_URL}/api/bookmarks/${bookmarkId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ page_html: html }),
      });
    }
  }

  return { ok: res.ok, status: res.status };
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

async function checkExistingBookmark(url) {
  const config = await getConfig();
  if (!config.token) return { exists: false };

  try {
    let token = config.token;
    const params = new URLSearchParams({ url });
    let res = await fetch(`${API_URL}/api/bookmarks/check?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      token = await refreshToken(config);
      if (!token) return { exists: false };
      res = await fetch(`${API_URL}/api/bookmarks/check?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (!res.ok) return { exists: false };
    return await res.json();
  } catch {
    return { exists: false };
  }
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
