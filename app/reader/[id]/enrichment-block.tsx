"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionItem = {
  type?: string;
  text: string;
  url?: string;
  timestamp?: string;
  timestamp_seconds?: number;
  video_id?: string;
  completed: boolean;
  created_at: string;
};

type Enrichment = {
  summary: string | null;
  action_items: ActionItem[];
  ai_tags: string[] | null;
  model: string | null;
  processed_at: string | null;
};

export function EnrichmentBlock({
  bookmarkId,
  enrichment,
}: {
  bookmarkId: number;
  enrichment: Enrichment | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function reanalyze() {
    setLoading(true);
    setError("");

    const res = await fetch(`/api/bookmarks/${bookmarkId}/enrich`, {
      method: "POST",
    });

    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed");
    }
  }

  async function toggleAction(index: number, completed: boolean) {
    await fetch(`/api/bookmarks/${bookmarkId}/enrich/actions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, completed }),
    });
    router.refresh();
  }

  const items = enrichment?.action_items ?? [];
  const hook = items.find((i) => i.type === "hook");
  const insights = items.filter((i) => i.type === "insight");
  const quotes = items.filter((i) => i.type === "quote");
  const actions = items.filter(
    (i) => i.type === "action" || (!i.type && i.text),
  );
  const isVideoEnrichment = hook || insights.length > 0 || quotes.length > 0;

  const hasContent =
    enrichment?.summary || (enrichment?.action_items?.length ?? 0) > 0;

  return (
    <div className="enrichment-block">
      {loading && <div className="enrich-status">Analyzing...</div>}
      {error && (
        <div
          className="enrich-status"
          style={{ color: "var(--danger, #c00)" }}
        >
          {error}
        </div>
      )}

      {isVideoEnrichment ? (
        <>
          {hook && (
            <div className="enrichment-hook">
              <p>{hook.text}</p>
            </div>
          )}

          {insights.length > 0 && (
            <div className="enrichment-insights">
              <span className="enrichment-label">Key Insights</span>
              <ul className="insights-list">
                {insights.map((item, i) => (
                  <li key={i}>{item.text}</li>
                ))}
              </ul>
            </div>
          )}

          {quotes.length > 0 && (
            <div className="enrichment-quotes">
              <span className="enrichment-label">Notable Quotes</span>
              {quotes.map((quote, i) => (
                <blockquote key={i} className="enrichment-quote">
                  <p>&ldquo;{quote.text}&rdquo;</p>
                  {quote.timestamp && (
                    <cite>
                      {quote.video_id ? (
                        <a
                          href={`https://youtu.be/${quote.video_id}?t=${quote.timestamp_seconds ?? 0}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="quote-timestamp"
                        >
                          {quote.timestamp}
                        </a>
                      ) : (
                        <span className="quote-timestamp">
                          {quote.timestamp}
                        </span>
                      )}
                    </cite>
                  )}
                </blockquote>
              ))}
            </div>
          )}

          {actions.length > 0 && (
            <div className="enrichment-actions">
              <span className="enrichment-label">Action Items</span>
              <ul className="action-items-list">
                {actions.map((item, i) => {
                  const realIndex = items.indexOf(item);
                  return (
                    <li
                      key={i}
                      className={item.completed ? "completed" : ""}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={(e) =>
                            toggleAction(realIndex, e.target.checked)
                          }
                        />
                        <span>{item.text}</span>
                      </label>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="action-item-link"
                        >
                          {(() => {
                            try {
                              return new URL(item.url).hostname.replace(
                                "www.",
                                "",
                              );
                            } catch {
                              return "link";
                            }
                          })()}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          {enrichment?.summary && (
            <div className="enrichment-summary">
              <span className="enrichment-label">Summary</span>
              <p>{enrichment.summary}</p>
            </div>
          )}

          {actions.length > 0 && (
            <div className="enrichment-actions">
              <span className="enrichment-label">Action Items</span>
              <ul className="action-items-list">
                {actions.map((item, i) => (
                  <li
                    key={i}
                    className={item.completed ? "completed" : ""}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={(e) =>
                          toggleAction(i, e.target.checked)
                        }
                      />
                      <span>{item.text}</span>
                    </label>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="action-item-link"
                      >
                        {(() => {
                          try {
                            const u = new URL(item.url);
                            const host = u.hostname.replace("www.", "");
                            if (host === "github.com") {
                              const parts = u.pathname
                                .split("/")
                                .filter(Boolean);
                              if (parts.length >= 2)
                                return `${host}/${parts[0]}/${parts[1]}`;
                            }
                            return host;
                          } catch {
                            return "link";
                          }
                        })()}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {enrichment?.ai_tags && enrichment.ai_tags.length > 0 && (
        <div className="enrichment-tags">
          <span className="enrichment-label">Suggested Tags</span>
          <div className="tags">
            {enrichment.ai_tags.map((t) => (
              <span key={t} className="tag ai-tag">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {!loading && hasContent && (
        <button
          className="reader-action-btn enrich-refresh"
          onClick={reanalyze}
        >
          re-analyze
        </button>
      )}
    </div>
  );
}
