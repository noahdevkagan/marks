"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { DeleteButton } from "./delete-button";

type Bookmark = {
  id: number;
  url: string;
  title: string;
  description: string;
  tags: string[];
  created_at: string;
  type?: string;
};

const TYPE_ICONS: Record<string, string> = {
  tweet: "\uD835\uDD4F",
  video: "\u25B6",
  image: "\uD83D\uDDBC\uFE0F",
  pdf: "\uD83D\uDCC4",
  product: "\uD83D\uDED2",
};

export function BookmarkItem({
  bookmark,
  currentTag,
}: {
  bookmark: Bookmark;
  currentTag?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(bookmark.title);
  const [url, setUrl] = useState(bookmark.url);
  const [description, setDescription] = useState(bookmark.description);
  const [tags, setTags] = useState<string[]>(bookmark.tags);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) tagInputRef.current?.focus();
  }, [editing]);

  function startEdit() {
    setTitle(bookmark.title);
    setUrl(bookmark.url);
    setDescription(bookmark.description);
    setTags([...bookmark.tags]);
    setTagInput("");
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
  }

  function addTag(value: string) {
    const t = value.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/bookmarks/${bookmark.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        url: url.trim(),
        description: description.trim(),
        tags,
      }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  let hostname = "";
  try {
    hostname = new URL(bookmark.url).hostname.replace("www.", "");
  } catch {
    hostname = bookmark.url;
  }

  if (editing) {
    return (
      <li className="bookmark-item bookmark-editing">
        <div className="edit-form">
          <label className="edit-label">Title</label>
          <input
            className="edit-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="edit-label">URL</label>
          <input
            className="edit-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <label className="edit-label">Description</label>
          <textarea
            className="edit-input edit-textarea"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="edit-label">Tags</label>
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
              ref={tagInputRef}
              className="tag-text-input"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => tagInput.trim() && addTag(tagInput)}
              placeholder="add tag…"
            />
          </div>
          <div className="edit-actions">
            <button
              className="edit-save-btn"
              onClick={save}
              disabled={saving || !url.trim()}
            >
              {saving ? "saving…" : "save"}
            </button>
            <button className="edit-cancel-btn" onClick={cancel}>
              cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="bookmark-item">
      <div className="bookmark-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="favicon"
          src={`https://www.google.com/s2/favicons?sz=32&domain=${hostname}`}
          alt=""
          width={16}
          height={16}
          loading="lazy"
        />
        {bookmark.type && bookmark.type !== "article" && TYPE_ICONS[bookmark.type] && (
          <span className="type-badge" title={bookmark.type}>
            {TYPE_ICONS[bookmark.type]}
          </span>
        )}
        <div className="bookmark-content">
          <Link
            href={`/reader/${bookmark.id}`}
            className="bookmark-title"
          >
            {bookmark.title || bookmark.url}
          </Link>
          <span className="bookmark-url">
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hostname-link"
              title="Open original"
            >
              {hostname} ↗
            </a>
          </span>
          <div className="bookmark-meta">
            <span className="date">
              {new Date(bookmark.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year:
                  new Date(bookmark.created_at).getFullYear() !==
                  new Date().getFullYear()
                    ? "numeric"
                    : undefined,
              })}
            </span>
            {bookmark.tags.length > 0 && (
              <div className="tags">
                {bookmark.tags.map((t) => (
                  <Link
                    key={t}
                    href={`/?tag=${encodeURIComponent(t)}`}
                    className="tag"
                  >
                    {t}
                  </Link>
                ))}
              </div>
            )}
            <button className="edit-btn" onClick={startEdit} title="Edit">
              edit
            </button>
            <DeleteButton bookmarkId={bookmark.id} />
          </div>
          {bookmark.description && (
            <p className="bookmark-description">{bookmark.description}</p>
          )}
        </div>
      </div>
    </li>
  );
}
