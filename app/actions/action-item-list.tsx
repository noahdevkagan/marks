"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionItem = {
  text: string;
  completed: boolean;
  created_at: string;
};

type EnrichedBookmark = {
  bookmark_id: number;
  summary: string | null;
  action_items: ActionItem[];
  processed_at: string | null;
  bookmark_title: string;
  bookmark_url: string;
  bookmark_type: string;
};

type Filter = "pending" | "all" | "completed";

export function ActionItemList({
  enrichedBookmarks,
}: {
  enrichedBookmarks: EnrichedBookmark[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("pending");

  async function toggleAction(
    bookmarkId: number,
    index: number,
    completed: boolean,
  ) {
    await fetch(`/api/bookmarks/${bookmarkId}/enrich/actions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, completed }),
    });
    router.refresh();
  }

  // Filter bookmarks based on whether they have matching action items
  const filtered = enrichedBookmarks
    .map((eb) => {
      const items = eb.action_items.filter((a) => {
        if (filter === "pending") return !a.completed;
        if (filter === "completed") return a.completed;
        return true;
      });
      return { ...eb, action_items: items };
    })
    .filter((eb) => eb.action_items.length > 0);

  return (
    <>
      <div className="actions-filter">
        <button
          className={`actions-filter-btn ${filter === "pending" ? "active" : ""}`}
          onClick={() => setFilter("pending")}
        >
          pending
        </button>
        <button
          className={`actions-filter-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          all
        </button>
        <button
          className={`actions-filter-btn ${filter === "completed" ? "active" : ""}`}
          onClick={() => setFilter("completed")}
        >
          completed
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <p>
            {filter === "pending"
              ? "All caught up! No pending actions."
              : filter === "completed"
                ? "No completed actions yet."
                : "No actions found."}
          </p>
        </div>
      ) : (
        <div className="actions-groups">
          {filtered.map((eb) => (
            <div key={eb.bookmark_id} className="actions-group">
              <div className="actions-group-header">
                <Link
                  href={`/reader/${eb.bookmark_id}`}
                  className="actions-group-title"
                >
                  {eb.bookmark_title || eb.bookmark_url}
                </Link>
                {eb.summary && (
                  <p className="actions-group-summary">{eb.summary}</p>
                )}
              </div>
              <ul className="action-items-list">
                {eb.action_items.map((item, i) => {
                  // Find the original index in the full action_items array
                  const origIndex = enrichedBookmarks
                    .find((x) => x.bookmark_id === eb.bookmark_id)!
                    .action_items.indexOf(item);

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
                            toggleAction(
                              eb.bookmark_id,
                              origIndex,
                              e.target.checked,
                            )
                          }
                        />
                        <span>{item.text}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
