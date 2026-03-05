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

  function handleBookmarkClick(btn) {
    console.log("[Marks] handleBookmarkClick — token:", !!config?.token, "data-testid:", btn.getAttribute("data-testid"));
    if (!config?.token) return;

    // We only capture clicks on [data-testid="bookmark"] (unbookmarked state).
    // After the 500ms delay, Twitter changes data-testid to "removeBookmark"
    // to confirm the bookmark was added. If it didn't change, the bookmark failed.
    if (btn.getAttribute("data-testid") !== "removeBookmark") return;

    // Find the parent tweet article
    const article = btn.closest("article");
    if (!article) return;

    // Extract tweet data from the DOM
    const tweetData = extractTweetData(article);
    if (!tweetData?.url) return;

    saveTweetToMarks(tweetData);
  }

  function extractTweetData(article) {
    // Get tweet text
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = textEl?.textContent?.trim() || "";

    // Get author handle
    const handleEl = article.querySelector('a[href^="/"][role="link"] span');
    const allLinks = article.querySelectorAll('a[role="link"]');
    let handle = "";
    let tweetUrl = "";

    for (const link of allLinks) {
      const href = link.getAttribute("href") || "";
      // Match /@username pattern
      if (href.match(/^\/\w+$/) && !href.includes("/")) {
        handle = href.slice(1);
      }
      // Match /username/status/1234 pattern
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
            const parts = href.split("/");
            handle = parts[1] || "";
          }
        }
      }
    }

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

    return {
      url: tweetUrl,
      text,
      handle,
      hashtags,
      mediaUrls,
      title: handle ? `@${handle}: ${text.slice(0, 100)}` : text.slice(0, 100),
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
            media_urls: tweet.mediaUrls || [],
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
