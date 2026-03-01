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

async function showSaveView() {
  saveView.style.display = "block";

  // Auto-fill from current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    document.getElementById("url").value = tab.url || "";
    document.getElementById("title").value = tab.title || "";
  }

  // Fetch suggested tags
  if (tab?.url && config.token) {
    fetchSuggestedTags(tab.url);
  }
}

async function fetchSuggestedTags(url) {
  suggestedTagsEl.style.display = "none";
  try {
    const res = await fetch(
      `${API_URL}/api/suggest-tags?url=${encodeURIComponent(url)}`,
      { headers: { Authorization: `Bearer ${config.token}` } },
    );
    if (!res.ok) return;
    const data = await res.json();
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
  } catch {
    // Suggestions are optional
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
