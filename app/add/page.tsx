"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function AddPage() {
  return (
    <Suspense>
      <AddForm />
    </Suspense>
  );
}

function AddForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [url, setUrl] = useState(searchParams.get("url") ?? "");
  const [title, setTitle] = useState(searchParams.get("title") ?? "");
  const [description, setDescription] = useState(
    searchParams.get("description") ?? "",
  );
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [readLater, setReadLater] = useState(false);
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [error, setError] = useState("");
  const isPopup = searchParams.has("url");

  useEffect(() => {
    // Fetch recent tags for pills
    const supabase = createClient();
    supabase
      .from("bookmark_tags")
      .select("tag_id, tags(name)")
      .limit(50)
      .then(({ data }) => {
        if (!data) return;
        const counts = new Map<string, number>();
        for (const row of data as unknown as {
          tag_id: number;
          tags: { name: string };
        }[]) {
          const name = row.tags?.name;
          if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        const sorted = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([name]) => name);
        setRecentTags(sorted);
      });
  }, []);

  function addTag(tag: string) {
    const normalized = tag.toLowerCase().trim();
    if (normalized && !tags.includes(normalized)) {
      setTags([...tags, normalized]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addTag(tagInput);
    }
    if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  async function fetchMetadata(targetUrl: string) {
    try {
      new URL(targetUrl);
    } catch {
      return;
    }
    setFetchingMeta(true);
    try {
      const res = await fetch(`/api/metadata?url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.title) setTitle((prev) => prev || data.title);
      if (data.suggestedTags?.length) setSuggestedTags(data.suggestedTags);
    } catch {
      // ignore fetch errors
    } finally {
      setFetchingMeta(false);
    }
  }

  // Fetch metadata on mount when URL comes from bookmarklet/params
  useEffect(() => {
    if (searchParams.has("url")) {
      fetchMetadata(searchParams.get("url")!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUrlBlur() {
    if (!url || suggestedTags.length > 0) return;
    fetchMetadata(url);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title,
          description,
          tags,
          is_read: !readLater,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }

      if (isPopup) {
        window.close();
        // If window.close() is a no-op (navigated, not a popup), redirect
        setTimeout(() => { window.location.href = "/"; }, 300);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <div className="container add-container">
      <h1>Add Bookmark</h1>

      <form onSubmit={handleSubmit} className="add-form">
        {error && <p className="auth-error">{error}</p>}

        <label htmlFor="url">URL</label>
        <input
          id="url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={handleUrlBlur}
          placeholder="https://..."
          required
          autoFocus={!isPopup}
        />

        <label htmlFor="title">Title{fetchingMeta && <span className="fetching-indicator"> (fetching...)</span>}</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page title"
        />

        <label htmlFor="description">Notes</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional notes..."
          rows={2}
        />

        <label>Tags</label>
        <div className="tag-input-wrap">
          {tags.map((t) => (
            <span
              key={t}
              className="tag tag-removable"
              onClick={() => removeTag(t)}
            >
              {t} &times;
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder={tags.length === 0 ? "Add tags..." : ""}
            className="tag-text-input"
          />
        </div>

        {(() => {
          const suggested = suggestedTags.filter((t) => !tags.includes(t));
          const recent = recentTags.filter((t) => !tags.includes(t));
          // Show suggested tags if available, otherwise fall back to recent tags
          const combined = suggested.length > 0 ? suggested : recent.slice(0, 10);
          if (combined.length === 0) return null;
          return (
            <div className="recent-tags">
              {combined.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="tag"
                  onClick={() => addTag(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          );
        })()}

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={readLater}
            onChange={(e) => setReadLater(e.target.checked)}
          />
          Read later
        </label>

        <button type="submit" disabled={saving || !url}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>

      {!isPopup && (
        <p className="add-footer">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              router.push("/");
            }}
          >
            &larr; back
          </a>
        </p>
      )}
    </div>
  );
}
