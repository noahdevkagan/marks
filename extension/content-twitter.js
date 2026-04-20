// Marks — Twitter auto-bookmark content script
// Detects when you bookmark a tweet on x.com and saves it to Marks

(function () {
  console.log("[Marks] content-twitter.js loaded on", window.location.href);
  const API_URL = "https://marks-drab.vercel.app";
  let config = null;
  let recentSaves = [];

  // Load config and recent saves
  chrome.storage.local.get(
    ["token", "refreshToken", "supabaseUrl", "supabaseKey"],
    (data) => {
      config = data;
    },
  );
  chrome.storage.local.get(["twitterRecentSaves"], (data) => {
    recentSaves = data.twitterRecentSaves || [];
  });

  // Stay in sync when user logs in/out from the popup
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.token) {
      chrome.storage.local.get(
        ["token", "refreshToken", "supabaseUrl", "supabaseKey"],
        (data) => { config = data; },
      );
    }
  });

  // Watch for bookmark button clicks using event delegation
  // Use capture phase because Twitter stops event propagation
  document.addEventListener("click", (e) => {
    const bookmarkBtn = e.target.closest('[data-testid="bookmark"]');
    console.log("[Marks] click detected, bookmark btn:", bookmarkBtn ? "found" : "not found", "testid:", e.target.closest("[data-testid]")?.getAttribute("data-testid"));
    if (!bookmarkBtn) return;

    console.log("[Marks] bookmark click captured, waiting 500ms...");
    // Small delay to let Twitter process the bookmark
    setTimeout(() => handleBookmarkClick(bookmarkBtn), 500);
  }, true);

  async function handleBookmarkClick(btn) {
    console.log("[Marks] handleBookmarkClick — token:", !!config?.token, "data-testid:", btn.getAttribute("data-testid"));
    if (!config?.token) return;

    // We only capture clicks on [data-testid="bookmark"] (unbookmarked state).
    // After the 500ms delay, Twitter changes data-testid to "removeBookmark"
    // to confirm the bookmark was added. If it didn't change, the bookmark failed.
    if (btn.getAttribute("data-testid") !== "removeBookmark") return;

    // Find the parent tweet article
    const article = btn.closest("article");
    if (!article) return;

    // Try to expand "Show more" for long/collapsed tweets before extracting
    const showMoreBtn = [...article.querySelectorAll("span")].find(
      (el) => el.textContent.trim().toLowerCase() === "show more",
    );
    if (showMoreBtn) {
      const clickTarget = showMoreBtn.closest("[role=\"button\"], a, button") || showMoreBtn;
      clickTarget.click();
      await new Promise((r) => setTimeout(r, 800));
    }

    // Extract tweet data from the DOM
    const tweetData = extractTweetData(article);
    if (!tweetData?.url) return;

    saveTweetToMarks(tweetData);
  }

  /** Extract handle and tweet URL from an article element */
  function extractHandleAndUrl(article) {
    let handle = "";
    let tweetUrl = "";
    const allLinks = article.querySelectorAll('a[role="link"]');

    for (const link of allLinks) {
      const href = link.getAttribute("href") || "";
      if (href.match(/^\/\w+$/) && !handle) {
        handle = href.slice(1);
      }
      if (href.match(/\/\w+\/status\/\d+/)) {
        tweetUrl = `https://x.com${href}`;
      }
    }

    // Fallback: try to get URL from the time element's parent link
    if (!tweetUrl) {
      const timeLink = article.querySelector("time")?.closest("a");
      if (timeLink) {
        const href = timeLink.getAttribute("href");
        if (href?.includes("/status/")) {
          tweetUrl = `https://x.com${href}`;
          if (!handle) {
            handle = href.split("/")[1] || "";
          }
        }
      }
    }

    // Strip trailing suffixes like /analytics, /retweets from tweet URLs
    if (tweetUrl) {
      tweetUrl = tweetUrl.replace(/\/(analytics|retweets|quotes|likes|hidden|history)\/?$/, "");
    }

    return { handle, tweetUrl };
  }

  function extractTweetData(article) {
    // Check for X Article (long-form content)
    const articleReadView = document.querySelector('[data-testid="twitterArticleReadView"]');
    if (articleReadView) {
      return extractXArticleData(article, articleReadView);
    }

    // Regular tweet extraction
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = textEl?.textContent?.trim() || "";

    const { handle, tweetUrl } = extractHandleAndUrl(article);
    if (!tweetUrl) return null;

    // Extract hashtags
    const hashtags = [];
    const hashtagEls = article.querySelectorAll('a[href^="/hashtag/"]');
    for (const el of hashtagEls) {
      const tag = el.textContent?.replace("#", "").toLowerCase().trim();
      if (tag) hashtags.push(tag);
    }

    // Extract media URLs (images and videos)
    const mediaUrls = [];
    const imgEls = article.querySelectorAll('img[src*="pbs.twimg.com"]');
    for (const img of imgEls) {
      const src = img.getAttribute("src");
      if (src && !src.includes("profile_images")) mediaUrls.push(src);
    }
    const videoEls = article.querySelectorAll("video source, video");
    for (const vid of videoEls) {
      const src = vid.getAttribute("src");
      if (src) mediaUrls.push(src);
    }

    // Build contentHtml for regular tweets (preserves links)
    let contentHtml = "";
    if (textEl) {
      contentHtml = extractTweetTextHtml(textEl);
      // Append media images
      for (const src of mediaUrls) {
        if (src.includes("pbs.twimg.com")) {
          contentHtml += '\n<img src="' + esc(cleanImgSrc(src)) + '" alt="Tweet media" />';
        }
      }
    }

    return {
      url: tweetUrl,
      text,
      contentHtml,
      handle,
      hashtags,
      mediaUrls,
      title: handle ? `@${handle}: ${text.slice(0, 100)}` : text.slice(0, 100),
    };
  }

  // --- HTML helpers for rich extraction ---

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** Convert tweetText element to HTML preserving links and line breaks */
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
            // Emoji images — use alt text
            html += el.alt || "";
          } else if (el.tagName === "A" || el.querySelector("a")) {
            const a = el.tagName === "A" ? el : el.querySelector("a");
            const href = a?.getAttribute("href") || "";
            const text = el.textContent || "";
            // Convert relative X links to absolute
            const fullHref = href.startsWith("/") ? "https://x.com" + href : href;
            html += '<a href="' + esc(fullHref) + '">' + esc(text) + "</a>";
          } else {
            // Recurse into wrapper elements (spans, divs) to preserve nested <br> and links
            html += walk(el);
          }
        }
      }
      return html;
    }
    return "<p>" + walk(textEl) + "</p>";
  }

  /** Walk up from a text node to stopAt, collecting bold/italic styles */
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

  /** Convert an element's text content to HTML preserving bold/italic spans */
  function processInlineFormatting(el) {
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

  /** Find the content container (div with many direct children) deep in the article view */
  function findContentContainer(el, depth) {
    if (depth > 10) return null;
    for (const child of el.children) {
      if (child.children.length > 10) return child;
      const found = findContentContainer(child, depth + 1);
      if (found) return found;
    }
    return null;
  }

  /** Clean a pbs.twimg.com image URL to get the best quality version */
  function cleanImgSrc(src) {
    try {
      const u = new URL(src);
      return u.origin + u.pathname + "?format=jpg&name=large";
    } catch { return src; }
  }

  /** Extract X Article (long-form) content as rich HTML */
  function extractXArticleData(article, articleReadView) {
    const titleEl = document.querySelector('[data-testid="twitter-article-title"]');
    const articleTitle = titleEl?.textContent?.trim() || "";

    const { handle, tweetUrl } = extractHandleAndUrl(article);
    if (!tweetUrl) return null;

    // Try rich HTML extraction from DOM structure
    const container = findContentContainer(articleReadView, 0);
    let contentHtml = "";
    const mediaUrls = [];

    if (container) {
      const blocks = [];

      // Header image (first child of articleReadView)
      const headerImg = articleReadView.children[0]?.querySelector("img");
      if (headerImg?.src?.includes("pbs.twimg.com")) {
        const src = cleanImgSrc(headerImg.src);
        blocks.push('<img src="' + esc(src) + '" alt="Article header" />');
        mediaUrls.push(src);
      }

      for (const child of container.children) {
        const tag = child.tagName;

        // BLOCKQUOTE element
        if (tag === "BLOCKQUOTE") {
          blocks.push("<blockquote>" + esc(child.textContent?.trim() || "") + "</blockquote>");
          continue;
        }

        // SECTION — may contain code block or image
        if (tag === "SECTION") {
          const pre = child.querySelector("pre");
          if (pre) {
            blocks.push("<pre><code>" + esc(pre.textContent || "") + "</code></pre>");
            continue;
          }
          const img = child.querySelector("img");
          if (img?.src?.includes("pbs.twimg.com")) {
            const src = cleanImgSrc(img.src);
            blocks.push('<img src="' + esc(src) + '" alt="' + esc(img.alt || "") + '" />');
            mediaUrls.push(src);
            continue;
          }
          // Fallback: treat section as paragraph
          const text = child.textContent?.trim();
          if (text) blocks.push("<p>" + esc(text) + "</p>");
          continue;
        }

        // UL list
        if (tag === "UL") {
          const items = [...child.querySelectorAll("li")].map(
            (li) => "<li>" + processInlineFormatting(li) + "</li>"
          );
          blocks.push("<ul>" + items.join("") + "</ul>");
          continue;
        }

        // DIV — check for h2, img, or treat as paragraph
        const h2 = child.querySelector("h2");
        if (h2) {
          blocks.push("<h2>" + esc(h2.textContent?.trim() || "") + "</h2>");
          continue;
        }

        const img = child.querySelector("img");
        if (img?.src?.includes("pbs.twimg.com")) {
          const src = cleanImgSrc(img.src);
          blocks.push('<img src="' + esc(src) + '" alt="' + esc(img.alt || "") + '" />');
          mediaUrls.push(src);
          continue;
        }

        // Regular paragraph with inline formatting
        const text = child.textContent?.trim();
        if (!text) continue;
        blocks.push("<p>" + processInlineFormatting(child) + "</p>");
      }

      contentHtml = blocks.join("\n");
    }

    // Also get plain text for backward compat / description fallback
    const bodyText = articleReadView.innerText?.trim() || "";

    return {
      url: tweetUrl,
      text: bodyText,
      contentHtml,
      handle,
      hashtags: [],
      mediaUrls,
      title: articleTitle || (handle ? `@${handle}` : bodyText.slice(0, 100)),
      isXArticle: true,
    };
  }

  async function saveTweetToMarks(tweet) {
    const tags = [...new Set([...tweet.hashtags, "twitter"])];

    try {
      // Route through background service worker to avoid CORS
      const result = await chrome.runtime.sendMessage({
        type: "save-bookmark",
        data: {
          url: tweet.url,
          title: tweet.title,
          description: tweet.text,
          tags,
          is_read: false,
          type: "tweet",
          type_metadata: {
            author: tweet.handle,
            tweet_text: tweet.text,
            content_html: tweet.contentHtml || "",
            media_urls: tweet.mediaUrls || [],
            ...(tweet.isXArticle && { x_article: true }),
          },
        },
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Save failed");
      }

      // Track recent save
      recentSaves.unshift({
        url: tweet.url,
        title: tweet.title,
        handle: tweet.handle,
        tags,
        savedAt: new Date().toISOString(),
      });
      recentSaves = recentSaves.slice(0, 10);
      chrome.storage.local.set({ twitterRecentSaves: recentSaves });

      showToast(`Saved to Marks: @${tweet.handle}`);
      updatePanel();
    } catch (err) {
      console.error("[Marks] save failed:", err);
      const msg = err.message || "Unknown error";
      showToast(`Failed: ${msg}`, true);
    }
  }

  // --- Toast notification ---

  function showToast(message, isError = false) {
    const existing = document.getElementById("marks-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "marks-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      padding: "10px 16px",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      color: "white",
      background: isError ? "#cc3333" : "#0066cc",
      zIndex: "999999",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      transition: "opacity 0.3s",
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // --- Recent saves panel (floating, toggled by extension icon) ---

  let panelVisible = false;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "toggle-panel") {
      panelVisible = !panelVisible;
      if (panelVisible) {
        showPanel();
      } else {
        hidePanel();
      }
    }
  });

  function showPanel() {
    hidePanel();
    if (recentSaves.length === 0) {
      showToast("No recent Twitter saves yet");
      return;
    }

    const panel = document.createElement("div");
    panel.id = "marks-panel";
    Object.assign(panel.style, {
      position: "fixed",
      top: "60px",
      right: "20px",
      width: "320px",
      maxHeight: "480px",
      overflowY: "auto",
      background: "#1a1a1a",
      border: "1px solid #333",
      borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      zIndex: "999998",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "13px",
      color: "#e5e5e5",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "12px 16px",
      borderBottom: "1px solid #333",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    });
    header.innerHTML = `
      <strong style="font-size:14px">Recent Marks</strong>
      <span id="marks-panel-close" style="cursor:pointer;color:#999;font-size:18px">&times;</span>
    `;
    panel.appendChild(header);

    for (const save of recentSaves) {
      const item = document.createElement("div");
      Object.assign(item.style, {
        padding: "10px 16px",
        borderBottom: "1px solid #222",
      });

      const timeAgo = getTimeAgo(new Date(save.savedAt));
      item.innerHTML = `
        <div style="font-weight:500;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <a href="${save.url}" style="color:#4d9fff;text-decoration:none" target="_blank">${escapeHtml(save.title)}</a>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
          ${save.tags.map((t) => `<span style="padding:1px 6px;background:#2a2a2a;color:#aaa;border-radius:3px;font-size:11px">${escapeHtml(t)}</span>`).join("")}
          <span style="color:#666;font-size:11px;margin-left:auto">${timeAgo}</span>
        </div>
      `;
      panel.appendChild(item);
    }

    document.body.appendChild(panel);

    document.getElementById("marks-panel-close").addEventListener("click", hidePanel);
    panelVisible = true;
  }

  function hidePanel() {
    document.getElementById("marks-panel")?.remove();
    panelVisible = false;
  }

  function updatePanel() {
    if (panelVisible) showPanel();
  }

  function getTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ========================================
  // Bookmark Sync — bulk import old bookmarks
  // ========================================

  const SYNC_CONFIG = {
    MAX_TWEETS: 500,
    MAX_AGE_DAYS: 30,
    MAX_CONSEC_DUPES: 5,
    // Slower, more human-like pacing to avoid detection
    SAVE_DELAY_MIN: 2000,
    SAVE_DELAY_MAX: 5000,
    SCROLL_DELAY_MIN: 4000,
    SCROLL_DELAY_MAX: 10000,
    BOTTOM_RETRY_DELAY: 6000,
    // Take a longer break every N tweets
    REST_EVERY: 15,
    REST_DELAY_MIN: 8000,
    REST_DELAY_MAX: 15000,
  };

  let syncState = null;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Random int between min and max (inclusive) */
  function randBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  // --- Contextual sync button on bookmarks page ---
  // Show a subtle "Import to Marks" button when user visits x.com/i/bookmarks

  if (window.location.pathname === "/i/bookmarks") {
    // Check if sync was requested (background tab opened by background.js)
    chrome.runtime.sendMessage({ type: "bookmark-sync-check" }).then((res) => {
      if (res?.shouldSync) {
        // Auto-start in background tab — no button needed
        setTimeout(() => startBookmarkSync(), 3000);
      } else {
        // User navigated here manually — show the import button
        setTimeout(() => {
          if (config?.token && !syncState?.running) showSyncButton();
        }, 1500);
      }
    });
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "start-bookmark-sync") startBookmarkSync();
    if (msg.type === "stop-bookmark-sync") stopBookmarkSync();
    if (msg.type === "bookmark-sync-notify") showToast(msg.message);
  });

  /** Show a subtle floating button on the bookmarks page */
  function showSyncButton() {
    if (document.getElementById("marks-sync-btn")) return;

    const btn = document.createElement("button");
    btn.id = "marks-sync-btn";
    btn.textContent = "Import to Marks";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      padding: "8px 16px",
      background: "#1a1a1a",
      color: "#999",
      border: "1px solid #333",
      borderRadius: "8px",
      fontSize: "12px",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      cursor: "pointer",
      zIndex: "999998",
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      transition: "color 0.15s, border-color 0.15s",
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.color = "#4d9fff";
      btn.style.borderColor = "#4d9fff";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.color = "#999";
      btn.style.borderColor = "#333";
    });
    btn.addEventListener("click", () => {
      btn.remove();
      // Ask background to open a background tab for sync
      chrome.runtime.sendMessage({ type: "bookmark-sync-start-bg" });
      showToast("Syncing bookmarks in background...");
    });

    document.body.appendChild(btn);
  }

  function removeSyncButton() {
    document.getElementById("marks-sync-btn")?.remove();
  }

  async function startBookmarkSync() {
    if (syncState?.running) return;

    if (window.location.pathname !== "/i/bookmarks") return;

    removeSyncButton();

    syncState = {
      running: true,
      paused: false,
      found: 0,
      saved: 0,
      skipped: 0,
      consecutiveDupes: 0,
      stopReason: null,
    };

    // Only show the panel if this is the active/visible tab
    if (document.visibilityState === "visible") {
      showSyncPanel();
    }
    await syncScrollLoop();
    chrome.runtime.sendMessage({
      type: "bookmark-sync-complete",
      saved: syncState.saved,
      found: syncState.found,
      reason: syncState.stopReason,
    });
  }

  function stopBookmarkSync() {
    if (syncState) {
      syncState.running = false;
      syncState.stopReason = "Stopped by user";
    }
  }

  async function syncScrollLoop() {
    const seenUrls = new Set();
    let totalProcessed = 0;

    while (syncState.running && !syncState.stopReason) {
      // Pause support
      while (syncState.paused && syncState.running) {
        updateSyncPanel("Paused");
        await sleep(500);
      }
      if (!syncState.running) break;

      // Find all tweet articles currently in DOM
      const articles = document.querySelectorAll("article");

      for (const article of articles) {
        if (!syncState.running || syncState.stopReason) break;
        while (syncState.paused && syncState.running) await sleep(500);

        // Expand "Show more" on truncated tweets before extracting
        const showMoreBtn = [...article.querySelectorAll("span")].find(
          (el) => el.textContent.trim().toLowerCase() === "show more",
        );
        if (showMoreBtn) {
          const clickTarget = showMoreBtn.closest('[role="button"], a, button') || showMoreBtn;
          clickTarget.click();
          await sleep(800);
        }

        // Extract tweet data using existing function
        const tweetData = extractTweetData(article);
        if (!tweetData?.url) continue;
        if (seenUrls.has(tweetData.url)) continue;
        seenUrls.add(tweetData.url);

        syncState.found++;
        totalProcessed++;

        // Check tweet age via <time> element
        const timeEl = article.querySelector("time");
        const datetime = timeEl?.getAttribute("datetime");
        if (datetime) {
          const ageDays = (Date.now() - new Date(datetime).getTime()) / 86400000;
          if (ageDays > SYNC_CONFIG.MAX_AGE_DAYS) {
            syncState.stopReason = `Reached ${SYNC_CONFIG.MAX_AGE_DAYS}-day limit`;
            break;
          }
        }

        // Save the tweet
        updateSyncPanel("Saving...");
        const tags = [...new Set([...tweetData.hashtags, "twitter"])];
        try {
          const result = await chrome.runtime.sendMessage({
            type: "save-bookmark",
            data: {
              url: tweetData.url,
              title: tweetData.title,
              description: tweetData.text,
              tags,
              is_read: false,
              type: "tweet",
              skip_enrichment: true,
              skipArchive: true,
              type_metadata: {
                author: tweetData.handle,
                tweet_text: tweetData.text,
                content_html: tweetData.contentHtml || "",
                media_urls: tweetData.mediaUrls || [],
                ...(tweetData.isXArticle && { x_article: true }),
              },
            },
          });

          if (result?.ok) {
            const bk = result.bookmark;
            const isNew = bk && (Date.now() - new Date(bk.created_at).getTime()) < 10000;
            if (isNew) {
              syncState.saved++;
              syncState.consecutiveDupes = 0;
            } else {
              syncState.skipped++;
              syncState.consecutiveDupes++;
            }
            // Update badge so user can see progress from any tab
            chrome.runtime.sendMessage({
              type: "bookmark-sync-progress",
              saved: syncState.saved,
              found: syncState.found,
            });
          }
        } catch (err) {
          console.error("[Marks] sync save error:", err);
        }

        // Check stop conditions
        if (syncState.found >= SYNC_CONFIG.MAX_TWEETS) {
          syncState.stopReason = `Reached ${SYNC_CONFIG.MAX_TWEETS}-tweet limit`;
          break;
        }
        if (syncState.consecutiveDupes >= SYNC_CONFIG.MAX_CONSEC_DUPES) {
          syncState.stopReason = "Caught up (already saved)";
          break;
        }

        // Periodic rest break — longer pause every N tweets to look human
        if (totalProcessed > 0 && totalProcessed % SYNC_CONFIG.REST_EVERY === 0) {
          const restDelay = randBetween(SYNC_CONFIG.REST_DELAY_MIN, SYNC_CONFIG.REST_DELAY_MAX);
          updateSyncPanel(`Resting ${Math.round(restDelay / 1000)}s...`);
          await sleep(restDelay);
        } else {
          // Normal delay between saves
          const saveDelay = randBetween(SYNC_CONFIG.SAVE_DELAY_MIN, SYNC_CONFIG.SAVE_DELAY_MAX);
          updateSyncPanel(`Waiting ${(saveDelay / 1000).toFixed(1)}s...`);
          await sleep(saveDelay);
        }

        updateSyncPanel();
      }

      if (syncState.stopReason) break;

      // Scroll down to load more — vary the distance for natural feel
      updateSyncPanel("Scrolling...");
      const scrollAmount = window.innerHeight * (0.5 + Math.random() * 0.5);
      window.scrollBy({ top: scrollAmount, behavior: "smooth" });

      const scrollDelay = randBetween(SYNC_CONFIG.SCROLL_DELAY_MIN, SYNC_CONFIG.SCROLL_DELAY_MAX);
      updateSyncPanel("Loading more tweets...");
      await sleep(scrollDelay);

      // Check if we hit the bottom (no new articles after scroll)
      const newArticles = document.querySelectorAll("article");
      let hasNew = false;
      for (const a of newArticles) {
        const { tweetUrl } = extractHandleAndUrl(a);
        if (tweetUrl && !seenUrls.has(tweetUrl)) {
          hasNew = true;
          break;
        }
      }

      if (!hasNew) {
        // Retry once more
        window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
        await sleep(SYNC_CONFIG.BOTTOM_RETRY_DELAY);

        const retryArticles = document.querySelectorAll("article");
        let retryHasNew = false;
        for (const a of retryArticles) {
          const { tweetUrl } = extractHandleAndUrl(a);
          if (tweetUrl && !seenUrls.has(tweetUrl)) {
            retryHasNew = true;
            break;
          }
        }
        if (!retryHasNew) {
          syncState.stopReason = "Reached end of bookmarks";
        }
      }
    }

    // Done
    syncState.running = false;
    showSyncComplete();
  }

  // --- Sync progress panel ---

  function showSyncPanel() {
    removeSyncPanel();

    const panel = document.createElement("div");
    panel.id = "marks-sync-panel";
    Object.assign(panel.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      width: "280px",
      background: "#1a1a1a",
      border: "1px solid #333",
      borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      zIndex: "999999",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "13px",
      color: "#e5e5e5",
      padding: "16px",
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <strong style="font-size:14px">Syncing Bookmarks</strong>
        <span id="marks-sync-close" style="cursor:pointer;color:#999;font-size:18px">&times;</span>
      </div>
      <div style="color:#666;font-size:11px;margin-bottom:10px">
        Importing last ${SYNC_CONFIG.MAX_AGE_DAYS} days of bookmarks
      </div>
      <div id="marks-sync-stats" style="margin-bottom:8px">
        <div style="display:flex;gap:12px;margin-bottom:4px">
          <span>Found: <strong id="marks-sync-found">0</strong></span>
          <span>Saved: <strong id="marks-sync-saved" style="color:#4d9fff">0</strong></span>
        </div>
        <div style="color:#999;font-size:11px">
          Already saved: <span id="marks-sync-skipped">0</span>
        </div>
      </div>
      <div id="marks-sync-action" style="color:#666;font-size:11px;margin-bottom:12px">Starting...</div>
      <div style="display:flex;gap:8px">
        <button id="marks-sync-pause" style="flex:1;padding:6px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#e5e5e5;cursor:pointer;font-size:12px;font-family:inherit">Pause</button>
        <button id="marks-sync-stop" style="flex:1;padding:6px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#ff5555;cursor:pointer;font-size:12px;font-family:inherit">Stop</button>
      </div>
    `;

    document.body.appendChild(panel);

    document.getElementById("marks-sync-close").addEventListener("click", () => {
      stopBookmarkSync();
      removeSyncPanel();
    });
    document.getElementById("marks-sync-pause").addEventListener("click", () => {
      if (!syncState) return;
      syncState.paused = !syncState.paused;
      document.getElementById("marks-sync-pause").textContent =
        syncState.paused ? "Resume" : "Pause";
    });
    document.getElementById("marks-sync-stop").addEventListener("click", () => {
      stopBookmarkSync();
    });
  }

  function updateSyncPanel(action) {
    const found = document.getElementById("marks-sync-found");
    const saved = document.getElementById("marks-sync-saved");
    const skipped = document.getElementById("marks-sync-skipped");
    const actionEl = document.getElementById("marks-sync-action");
    if (!found || !syncState) return;

    found.textContent = syncState.found;
    saved.textContent = syncState.saved;
    skipped.textContent = syncState.skipped;
    if (action) actionEl.textContent = action;
  }

  function showSyncComplete() {
    const actionEl = document.getElementById("marks-sync-action");
    if (!actionEl || !syncState) return;

    const reason = syncState.stopReason || "Complete";
    actionEl.innerHTML = `<span style="color:#4d9fff">${escapeHtml(reason)}</span>`;

    // Replace buttons with a "Done" button
    const pauseBtn = document.getElementById("marks-sync-pause");
    const stopBtn = document.getElementById("marks-sync-stop");
    if (pauseBtn) pauseBtn.style.display = "none";
    if (stopBtn) {
      stopBtn.textContent = "Done";
      stopBtn.style.color = "#e5e5e5";
      stopBtn.onclick = () => removeSyncPanel();
    }

    // Update header
    const panel = document.getElementById("marks-sync-panel");
    const header = panel?.querySelector("strong");
    if (header) header.textContent = "Sync Complete";

    // Final stats update
    updateSyncPanel();
  }

  function removeSyncPanel() {
    document.getElementById("marks-sync-panel")?.remove();
  }
})();
