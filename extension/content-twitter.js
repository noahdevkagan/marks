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

  /** Convert tweetText element to HTML preserving links */
  function extractTweetTextHtml(textEl) {
    let html = "";
    for (const node of textEl.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        html += esc(node.textContent || "");
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        if (el.tagName === "A" || el.querySelector("a")) {
          const a = el.tagName === "A" ? el : el.querySelector("a");
          const href = a?.getAttribute("href") || "";
          const text = el.textContent || "";
          // Convert relative X links to absolute
          const fullHref = href.startsWith("/") ? "https://x.com" + href : href;
          html += '<a href="' + esc(fullHref) + '">' + esc(text) + "</a>";
        } else if (el.tagName === "IMG") {
          // Emoji images — use alt text
          html += el.alt || "";
        } else if (el.tagName === "BR") {
          html += "<br>";
        } else {
          html += esc(el.textContent || "");
        }
      }
    }
    return "<p>" + html + "</p>";
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
})();
