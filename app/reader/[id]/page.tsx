import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookmark } from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { ArchiveActions } from "./archive-actions";
import { EnrichActions } from "./enrich-actions";

type Props = { params: Promise<{ id: string }> };

export default async function ReaderPage({ params }: Props) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);

  const bookmark = await getBookmark(id);
  if (!bookmark) notFound();

  // Fetch archived content and enrichment data
  const supabase = await createClient();
  const [{ data: archived }, { data: enrichment }] = await Promise.all([
    supabase.from("archived_content").select("*").eq("bookmark_id", id).single(),
    supabase.from("bookmark_enrichments").select("*").eq("bookmark_id", id).single(),
  ]);

  return (
    <div className="reader-container">
      <nav className="reader-nav">
        <Link href="/">&larr; back</Link>
        <div className="reader-nav-actions">
          <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
            original
          </a>
          <ArchiveActions
            bookmarkId={id}
            bookmarkUrl={bookmark.url}
            isArchived={!!archived}
            source={archived?.source}
          />
          {!enrichment && (
            <EnrichActions bookmarkId={id} enrichment={null} />
          )}
        </div>
      </nav>

      <article className="reader-article">
        <header className="reader-header">
          <h1>{bookmark.title || bookmark.url}</h1>
          {archived?.byline && (
            <p className="reader-byline">{archived.byline}</p>
          )}
          <div className="reader-meta">
            <span>{new URL(bookmark.url).hostname.replace("www.", "")}</span>
            {archived && (
              <>
                <span>&middot;</span>
                <span>{archived.word_count?.toLocaleString()} words</span>
                <span>&middot;</span>
                <span>
                  {Math.ceil((archived.word_count ?? 0) / 250)} min read
                </span>
              </>
            )}
            {archived?.source && archived.source !== "readability" && (
              <>
                <span>&middot;</span>
                <span className="reader-source">
                  via {archived.source === "wayback" ? "wayback machine" : "archive.ph"}
                </span>
              </>
            )}
          </div>
        </header>

        {archived ? (
          <div
            className="reader-content"
            dangerouslySetInnerHTML={{ __html: archived.content_html }}
          />
        ) : (
          <div className="reader-empty">
            <p>This article hasn&rsquo;t been archived yet.</p>
            <p>
              Click <strong>archive</strong> above to extract the article
              content for offline reading.
            </p>
          </div>
        )}
      </article>

      {enrichment && (
        <EnrichActions bookmarkId={id} enrichment={enrichment} />
      )}

      {bookmark.tags.length > 0 && (
        <div className="reader-tags">
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
    </div>
  );
}
