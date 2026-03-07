import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookmark } from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { ArchiveActions } from "./archive-actions";
import { EnrichmentBlock } from "./enrichment-block";
import { ReaderMarkReadButton } from "./mark-read-button";
import { PdfViewer } from "./pdf-viewer";
import { ReadingProgress } from "./reading-progress";
import { ReadingTracker } from "./reading-tracker";

type Props = { params: Promise<{ id: string }> };

function getYouTubeId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    return u.searchParams.get("v") ?? "";
  } catch {
    return "";
  }
}

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
      <ReadingProgress />
      <ReadingTracker bookmarkId={id} wordCount={archived?.word_count ?? 0} />
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
          <ReaderMarkReadButton bookmarkId={id} isRead={bookmark.is_read} />
        </div>
      </nav>

      <article className="reader-article">
        <header className="reader-header">
          <h1>{bookmark.title || bookmark.url}</h1>
          {bookmark.type === "tweet" && bookmark.type_metadata?.author && (
            <p className="reader-byline">
              @{String(bookmark.type_metadata.author)}
            </p>
          )}
          {bookmark.type !== "tweet" && archived?.byline && (
            <p className="reader-byline">{archived.byline}</p>
          )}
          <div className="reader-meta">
            {bookmark.type && bookmark.type !== "article" && (
              <>
                <span className="reader-type-badge">{bookmark.type}</span>
                <span>&middot;</span>
              </>
            )}
            <span>
              {bookmark.type === "pdf" && bookmark.url.startsWith("pdf://")
                ? (bookmark.type_metadata?.page_count
                    ? `${bookmark.type_metadata.page_count} pages`
                    : "uploaded")
                : new URL(bookmark.url).hostname.replace("www.", "")}
            </span>
            {archived && bookmark.type !== "video" && bookmark.type !== "image" && (
              <>
                <span>&middot;</span>
                <span>{archived.word_count?.toLocaleString()} words</span>
                <span>&middot;</span>
                <span>
                  {Math.ceil((archived.word_count ?? 0) / 250)} min read
                </span>
              </>
            )}
            {archived?.source && archived.source !== "readability" && archived.source !== "tweet" && archived.source !== "pdf" && (
              <>
                <span>&middot;</span>
                <span className="reader-source">
                  via {archived.source === "wayback" ? "wayback machine" : "archive.ph"}
                </span>
              </>
            )}
          </div>
        </header>

        {bookmark.type === "tweet" ? (() => {
          const contentHtml = bookmark.type_metadata?.content_html
            ? String(bookmark.type_metadata.content_html)
            : "";
          const tweetText =
            bookmark.description ||
            (bookmark.type_metadata?.tweet_text ? String(bookmark.type_metadata.tweet_text) : "") ||
            bookmark.title;
          return (
            <div className="reader-tweet">
              {contentHtml ? (
                <div
                  className="reader-content"
                  dangerouslySetInnerHTML={{ __html: contentHtml }}
                />
              ) : tweetText.length > 500 ? (
                <div
                  className="reader-content"
                  dangerouslySetInnerHTML={{
                    __html: tweetText
                      .split(/\n/)
                      .map((line: string) => {
                        const t = line.trim();
                        if (!t) return "";
                        const escaped = t
                          .replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;");
                        if (t.length < 80 && !/[.!?:,;"]$/.test(t)) {
                          return `<h3>${escaped}</h3>`;
                        }
                        return `<p>${escaped}</p>`;
                      })
                      .filter(Boolean)
                      .join("\n"),
                  }}
                />
              ) : (
                <blockquote className="reader-tweet-text">{tweetText}</blockquote>
              )}
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="reader-tweet-link"
              >
                View on X &rarr;
              </a>
            </div>
          );
        })() : bookmark.type === "video" ? (
          <div className="reader-video">
            {bookmark.url.includes("youtube.com") || bookmark.url.includes("youtu.be") ? (
              <iframe
                className="reader-video-embed"
                src={`https://www.youtube.com/embed/${getYouTubeId(bookmark.url)}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={bookmark.title}
              />
            ) : (
              <p>
                <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="reader-video-link">
                  Watch video &rarr;
                </a>
              </p>
            )}
            {archived && (
              <div
                className="reader-content"
                dangerouslySetInnerHTML={{ __html: archived.content_html }}
              />
            )}
          </div>
        ) : bookmark.type === "pdf" ? (
          <div className="reader-pdf">
            <PdfViewer
              pdfUrl={`/api/pdf/${id}`}
              contentHtml={archived?.content_html}
            />
          </div>
        ) : bookmark.type === "image" ? (
          <div className="reader-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bookmark.url} alt={bookmark.title || "Bookmarked image"} className="reader-image-full" />
          </div>
        ) : archived ? (
          <div
            className="reader-content"
            dangerouslySetInnerHTML={{ __html: archived.content_html }}
          />
        ) : (
          <div className="reader-empty">
            <p>We couldn&rsquo;t extract this article.</p>
            <p>
              Try viewing the{" "}
              <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
                original page
              </a>
              {" "}instead.
            </p>
          </div>
        )}
      </article>

      <EnrichmentBlock bookmarkId={id} enrichment={enrichment} />

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
