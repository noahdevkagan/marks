"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionItem = {
  text: string;
  url?: string;
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
  const [status, setStatus] = useState("");

  async function reanalyze() {
    setLoading(true);
    setStatus("Analyzing...");

    const res = await fetch(`/api/bookmarks/${bookmarkId}/enrich`, {
      method: "POST",
    });

    if (res.ok) {
      setStatus("");
      setLoading(false);
      router.refresh();
    } else {
      const data = await res.json();
      setStatus(data.error ?? "Failed");
      setLoading(false);
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

  if (!enrichment) return null;

  if (loading) {
    return <div className="enrich-status">{status}</div>;
  }

  return (
    <div className="enrichment-block">
      {enrichment.summary && (
        <div className="enrichment-summary">
          <span className="enrichment-label">Summary</span>
          <p>{enrichment.summary}</p>
        </div>
      )}

      {enrichment.action_items.length > 0 && (
        <div className="enrichment-actions">
          <span className="enrichment-label">Action Items</span>
          <ul className="action-items-list">
            {enrichment.action_items.map((item, i) => (
              <li key={i} className={item.completed ? "completed" : ""}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(e) => toggleAction(i, e.target.checked)}
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
                          const parts = u.pathname.split("/").filter(Boolean);
                          if (parts.length >= 2) return `${host}/${parts[0]}/${parts[1]}`;
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

      {enrichment.ai_tags && enrichment.ai_tags.length > 0 && (
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

      <button
        className="reader-action-btn enrich-refresh"
        onClick={reanalyze}
      >
        re-analyze
      </button>
    </div>
  );
}
