const API_URL = "https://marks-drab.vercel.app";
const SUPABASE_URL = "https://pwrrtbvaynlsxckazczx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cnJ0YnZheW5sc3hja2F6Y3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzAxMTMsImV4cCI6MjA4NzcwNjExM30.lOOTgbwoUW6-5XSQC_kJn3K_iO-1m565jQ4FXQR3LiA";

const loginView = document.getElementById("login-view");
const saveView = document.getElementById("save-view");
const loginForm = document.getElementById("login-form");
const saveForm = document.getElementById("save-form");
const loginError = document.getElementById("login-error");
const saveStatus = document.getElementById("save-status");
const tagWrap = document.getElementById("tag-wrap");
const tagInput = document.getElementById("tag-input");
const suggestedTagsEl = document.getElementById("suggested-tags");

let tags = [];
let config = {};

// Init
document.addEventListener("DOMContentLoaded", async () => {
  config = await chrome.storage.local.get([
    "token", "refreshToken", "supabaseUrl", "supabaseKey",
  ]);

  if (config.token) {
    showSaveView();
  } else {
    loginView.style.display = "block";
  }
});

// --- Login ---

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  btn.textContent = "Signing in...";

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    // Sign in via Supabase REST API
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error_description || data.msg || "Login failed");
    }

    const data = await res.json();
    await chrome.storage.local.set({
      token: data.access_token,
      refreshToken: data.refresh_token,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });

    config = await chrome.storage.local.get([
      "token", "refreshToken", "supabaseUrl", "supabaseKey",
    ]);
    loginView.style.display = "none";
    showSaveView();
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

// --- Save ---

function isTweetUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    return (host === "x.com" || host === "twitter.com") && u.pathname.includes("/status/");
  } catch { return false; }
}

async function showSaveView() {
  saveView.style.display = "block";

  // Auto-fill from current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    document.getElementById("url").value = tab.url || "";

    // For tweet/article pages, extract full text from DOM
    if (tab.id && tab.url && isTweetUrl(tab.url)) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Check for X Article
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
              return { title: articleTitle, text: bodyText };
            }
            // Regular tweet
            const article = document.querySelector("article");
            const textEl = article?.querySelector('[data-testid="tweetText"]');
            const text = textEl?.textContent?.trim() || "";
            return { title: "", text };
          },
        });
        const tweetData = results?.[0]?.result;
        if (tweetData?.text) {
          document.getElementById("description").value = tweetData.text;
          if (tweetData.title) {
            document.getElementById("title").value = tweetData.title;
          } else {
            document.getElementById("title").value = tab.title || "";
          }
        }
      } catch {
        document.getElementById("title").value = tab.title || "";
      }
    } else {
      // Non-tweet: try og:title for better titles on paywalled pages
      let title = tab.title || "";
      if (tab.id) {
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
          // scripting may fail on chrome:// pages etc — use tab.title
        }
      }
      document.getElementById("title").value = title;
    }
  }

  // Fetch suggested tags (pass title for better AI context on SPAs like x.com)
  if (tab?.url && config.token) {
    const titleVal = document.getElementById("title").value || "";
    fetchSuggestedTags(tab.url, titleVal);
  }
}

async function fetchSuggestedTags(url, title) {
  suggestedTagsEl.style.display = "none";
  try {
    // Route through background service worker for auth + CORS handling
    const data = await chrome.runtime.sendMessage({
      type: "suggest-tags",
      url,
      title: title || "",
    });
    if (data.tags?.length > 0) {
      // Clear old suggestions
      suggestedTagsEl.querySelectorAll(".suggested-tag").forEach((el) => el.remove());
      for (const tag of data.tags) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tag suggested-tag";
        btn.textContent = `+ ${tag}`;
        btn.addEventListener("click", () => {
          addTag(tag);
          btn.remove();
          if (!suggestedTagsEl.querySelector(".suggested-tag")) {
            suggestedTagsEl.style.display = "none";
          }
        });
        suggestedTagsEl.appendChild(btn);
      }
      suggestedTagsEl.style.display = "flex";
    }
  } catch (err) {
    console.error("[Marks] suggest-tags error:", err);
  }
}

// --- Tags ---

function addTag(name) {
  const normalized = name.toLowerCase().trim();
  if (!normalized || tags.includes(normalized)) return;
  tags.push(normalized);
  renderTags();
}

function removeTag(name) {
  tags = tags.filter((t) => t !== name);
  renderTags();
}

function renderTags() {
  tagWrap.querySelectorAll(".tag").forEach((el) => el.remove());
  for (const t of tags) {
    const span = document.createElement("span");
    span.className = "tag tag-removable";
    span.textContent = `${t} ×`;
    span.addEventListener("click", () => removeTag(t));
    tagWrap.insertBefore(span, tagInput);
  }
  tagInput.placeholder = tags.length === 0 ? "Add tags..." : "";
}

tagInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "," || e.key === " ") {
    e.preventDefault();
    addTag(tagInput.value);
    tagInput.value = "";
  }
  if (e.key === "Backspace" && !tagInput.value && tags.length > 0) {
    tags.pop();
    renderTags();
  }
});

// --- Save form ---

saveForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";
  saveStatus.textContent = "";
  saveStatus.className = "status";

  const data = {
    url: document.getElementById("url").value,
    title: document.getElementById("title").value,
    description: document.getElementById("description").value,
    tags,
    is_read: !document.getElementById("read-later").checked,
  };

  const result = await chrome.runtime.sendMessage({ type: "save-bookmark", data });

  if (result?.ok) {
    saveStatus.textContent = "Saved!";
    saveStatus.className = "status success";
    btn.textContent = "Saved";
    setTimeout(() => window.close(), 800);
  } else {
    saveStatus.textContent = result?.error || "Save failed";
    saveStatus.className = "status error";
    btn.disabled = false;
    btn.textContent = "Save";
  }
});

// --- Sign out ---

document.getElementById("sign-out").addEventListener("click", async () => {
  await chrome.storage.local.remove(["token", "refreshToken"]);
  saveView.style.display = "none";
  loginView.style.display = "block";
});
