// Marks — Twitter auto-bookmark content script
// Detects when you bookmark a tweet on x.com and saves it to Marks

(function () {
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
  document.addEventListener("click", (e) => {
    const bookmarkBtn = e.target.closest('[data-testid="bookmark"]');
    if (!bookmarkBtn) return;

    // Small delay to let Twitter process the bookmark
    setTimeout(() => handleBookmarkClick(bookmarkBtn), 500);
  });

  function handleBookmarkClick(btn) {
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

    return {
      url: tweetUrl,
      text,
      handle,
      hashtags,
      title: handle ? `@${handle}: ${text.slice(0, 100)}` : text.slice(0, 100),
    };
  }

  async function saveTweetToMarks(tweet) {
    const tags = [...new Set([...tweet.hashtags, "twitter"])];

    try {
      const res = await fetch(`${API_URL}/api/bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({
          url: tweet.url,
          title: tweet.title,
          description: tweet.text,
          tags,
          is_read: false,
        }),
      });

      if (res.status === 401) {
        // Try refresh
        const refreshed = await refreshToken();
        if (refreshed) {
          await fetch(`${API_URL}/api/bookmarks`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${refreshed}`,
            },
            body: JSON.stringify({
              url: tweet.url,
              title: tweet.title,
              description: tweet.text,
              tags,
              is_read: false,
            }),
          });
        }
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
    } catch {
      showToast("Failed to save to Marks", true);
    }
  }

  async function refreshToken() {
    if (!config.refreshToken || !config.supabaseUrl || !config.supabaseKey) return null;
    try {
      const res = await fetch(
        `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.supabaseKey,
          },
          body: JSON.stringify({ refresh_token: config.refreshToken }),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      config.token = data.access_token;
      config.refreshToken = data.refresh_token;
      chrome.storage.local.set({
        token: data.access_token,
        refreshToken: data.refresh_token,
      });
      return data.access_token;
    } catch {
      return null;
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
