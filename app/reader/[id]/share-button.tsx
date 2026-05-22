"use client";

import { useEffect, useState } from "react";

type Props = {
  bookmarkId: number;
  initialIsPublic: boolean;
  initialSlug: string | null;
  bookmarkTitle: string;
};

export function ShareButton({
  bookmarkId,
  initialIsPublic,
  initialSlug,
  bookmarkTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [slug, setSlug] = useState(initialSlug);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const shareUrl = slug ? `${origin}/s/${slug}` : "";

  async function togglePublic(next: boolean) {
    setLoading(true);
    setError("");
    try {
      if (next) {
        const res = await fetch(`/api/bookmarks/${bookmarkId}/share`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.slug) {
          setSlug(data.slug);
          setIsPublic(true);
        } else {
          setError(
            data.error
              ? `${data.error} (run supabase-migration-share.sql?)`
              : `Couldn't share (HTTP ${res.status}). Did you run the migration?`,
          );
        }
      } else {
        const res = await fetch(`/api/bookmarks/${bookmarkId}/share`, {
          method: "DELETE",
        });
        if (res.ok) {
          setIsPublic(false);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? `Couldn't unshare (HTTP ${res.status})`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  // Default-on: when modal opens and not already public, enable immediately
  async function openModal() {
    setOpen(true);
    if (!isPublic) {
      await togglePublic(true);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked; user can copy manually
    }
  }

  async function nativeShare() {
    if (!shareUrl) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: bookmarkTitle,
          text: `${bookmarkTitle} — shared via Marks`,
          url: shareUrl,
        });
      } catch {
        // user cancelled
      }
    } else {
      copyLink();
    }
  }

  const twitterIntent = shareUrl
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        `${bookmarkTitle} — saved via @getmarks 🔖`,
      )}&url=${encodeURIComponent(shareUrl)}`
    : "#";

  const emailHref = shareUrl
    ? `mailto:?subject=${encodeURIComponent(bookmarkTitle)}&body=${encodeURIComponent(
        `Thought you'd like this:\n\n${shareUrl}\n\n(Saved with Marks)`,
      )}`
    : "#";

  return (
    <>
      <button
        type="button"
        className="reader-action-btn share-trigger"
        onClick={openModal}
      >
        share
      </button>

      {open && (
        <div
          className="share-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="share-modal" role="dialog" aria-label="Share article">
            <div className="share-modal-header">
              <h2>Share this article</h2>
              <button
                type="button"
                className="share-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="share-modal-sub">
              Anyone with the link can read it — they don&rsquo;t need a Marks account.
            </p>

            {error && (
              <div className="share-error">{error}</div>
            )}

            <div className="share-toggle-row">
              <div>
                <div className="share-toggle-label">Public link</div>
                <div className="share-toggle-desc">
                  {isPublic ? "Anyone with the link can view" : "Turn on to generate a shareable URL"}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                disabled={loading}
                className={`share-switch ${isPublic ? "on" : ""}`}
                onClick={() => togglePublic(!isPublic)}
              />
            </div>

            {isPublic && shareUrl && (
              <>
                <div className="share-link-box">
                  <span className="share-link-text">{shareUrl}</span>
                  <button
                    type="button"
                    className="share-copy-btn"
                    onClick={copyLink}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>

                <div className="share-targets">
                  <button
                    type="button"
                    className="share-target"
                    onClick={nativeShare}
                  >
                    <span className="share-target-icon" aria-hidden>💬</span>
                    <span>Share…</span>
                  </button>
                  <a
                    className="share-target"
                    href={twitterIntent}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="share-target-icon" aria-hidden>𝕏</span>
                    <span>Twitter</span>
                  </a>
                  <a className="share-target" href={emailHref}>
                    <span className="share-target-icon" aria-hidden>✉</span>
                    <span>Email</span>
                  </a>
                </div>
              </>
            )}

            {isPublic && (
              <button
                type="button"
                className="share-stop-link"
                onClick={() => togglePublic(false)}
                disabled={loading}
              >
                Stop sharing
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
