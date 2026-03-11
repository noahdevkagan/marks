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
let tweetMeta = null; // Populated when on a tweet page

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

function isLinkedInPostUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    return host === "linkedin.com" && (u.pathname.includes("/posts/") || u.pathname.includes("/feed/update/"));
  } catch { return false; }
}

async function showSaveView() {
  saveView.style.display = "block";

  // Auto-fill from current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    document.getElementById("url").value = tab.url || "";

    // For tweet/article pages, extract full text + HTML from DOM
    if (tab.id && tab.url && isTweetUrl(tab.url)) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            function esc(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
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
            function getHandle() {
              const article = document.querySelector("article");
              if (!article) return "";
              const links = article.querySelectorAll('a[role="link"]');
              for (const link of links) {
                const href = link.getAttribute("href") || "";
                if (href.match(/^\/\w+$/)) return href.slice(1);
              }
              return "";
            }

            // Check for X Article
            const articleReadView = document.querySelector('[data-testid="twitterArticleReadView"]');
            if (articleReadView) {
              const titleEl = document.querySelector('[data-testid="twitter-article-title"]');
              const articleTitle = titleEl?.textContent?.trim() || "";
              const handle = getHandle();
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
                  if (tag === "BLOCKQUOTE") { blocks.push("<blockquote>" + esc(child.textContent?.trim() || "") + "</blockquote>"); continue; }
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
              return { title: articleTitle, text: bodyText, contentHtml, handle, isArticle: true, mediaUrls };
            }
            // Regular tweet
            const article = document.querySelector("article");
            const textEl = article?.querySelector('[data-testid="tweetText"]');
            const text = textEl?.textContent?.trim() || "";
            const handle = getHandle();
            let contentHtml = "";
            if (textEl) {
              let html = "";
              for (const node of textEl.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) { html += esc(node.textContent || ""); }
                else if (node.nodeType === Node.ELEMENT_NODE) {
                  const el = node;
                  if (el.tagName === "A" || el.querySelector("a")) {
                    const a = el.tagName === "A" ? el : el.querySelector("a");
                    const href = a?.getAttribute("href") || "";
                    const fullHref = href.startsWith("/") ? "https://x.com" + href : href;
                    html += '<a href="' + esc(fullHref) + '">' + esc(el.textContent || "") + "</a>";
                  } else if (el.tagName === "IMG") { html += el.alt || ""; }
                  else if (el.tagName === "BR") { html += "<br>"; }
                  else { html += esc(el.textContent || ""); }
                }
              }
              contentHtml = "<p>" + html + "</p>";
              const imgs = article?.querySelectorAll('img[src*="pbs.twimg.com"]') || [];
              for (const img of imgs) {
                if (!img.src.includes("profile_images")) {
                  contentHtml += '\n<img src="' + esc(cleanImgSrc(img.src)) + '" alt="Tweet media" />';
                }
              }
            }
            return { title: "", text, contentHtml, handle, isArticle: false };
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
          // Store tweet metadata for save
          tweetMeta = {
            author: tweetData.handle || "",
            tweet_text: tweetData.text,
            content_html: tweetData.contentHtml || "",
            media_urls: tweetData.mediaUrls || [],
            ...(tweetData.isArticle && { x_article: true }),
          };
        }
      } catch {
        document.getElementById("title").value = tab.title || "";
      }
    } else if (tab.id && tab.url && isLinkedInPostUrl(tab.url)) {
      // LinkedIn post: extract author + post text from DOM
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Find the main post container — try permalink overlay first, then feed
            const post = document.querySelector('.scaffold-finite-scroll__content .feed-shared-update-v2')
              || document.querySelector('.feed-shared-update-v2')
              || document.querySelector('[data-urn]');

            // Author name
            const authorEl = post?.querySelector('.update-components-actor__name span[aria-hidden="true"]')
              || post?.querySelector('.feed-shared-actor__name span[aria-hidden="true"]')
              || document.querySelector('.update-components-actor__name span[aria-hidden="true"]')
              || document.querySelector('.feed-shared-actor__name span[aria-hidden="true"]');
            const author = authorEl?.textContent?.trim() || "";

            // Post text
            const textEl = post?.querySelector('.update-components-text .break-words')
              || post?.querySelector('.feed-shared-update-v2__description .break-words')
              || post?.querySelector('.break-words')
              || document.querySelector('.update-components-text .break-words')
              || document.querySelector('.feed-shared-update-v2__description .break-words');
            const text = textEl?.innerText?.trim() || "";

            return { author, text };
          },
        });
        const li = results?.[0]?.result;
        if (li) {
          // Build title from author + first line of post
          const firstLine = (li.text || "").split("\n")[0].substring(0, 120);
          const title = li.author
            ? li.author + (firstLine ? ": " + firstLine : "")
            : firstLine || tab.title || "";
          document.getElementById("title").value = title;
          if (li.text) {
            document.getElementById("description").value = li.text;
          }
        } else {
          document.getElementById("title").value = tab.title || "";
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

  const url = document.getElementById("url").value;
  const data = {
    url,
    title: document.getElementById("title").value,
    description: document.getElementById("description").value,
    tags,
    is_read: !document.getElementById("read-later").checked,
    ...(tweetMeta && {
      type: "tweet",
      type_metadata: tweetMeta,
    }),
  };

  // Detect tweet URLs and add type metadata
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");
    if ((host === "x.com" || host === "twitter.com") && parsed.pathname.includes("/status/")) {
      data.type = "tweet";
      const parts = parsed.pathname.split("/");
      const handle = parts[1] || "";
      if (handle) {
        data.type_metadata = { author: handle };
      }
    }
  } catch {}


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
