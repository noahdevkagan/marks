import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookmark, updateBookmark } from "@/lib/db";
import { extractMetadata } from "@/lib/extract";
import { resolveTweetLinkTitle } from "@/lib/twitter";
import { createClient } from "@/lib/supabase-server";
import { AnalyzeButton } from "./analyze-button";
import { ArchiveActions } from "./archive-actions";
import { EnrichmentBlock } from "./enrichment-block";
import { ReaderMarkReadButton } from "./mark-read-button";
import { PdfViewer } from "./pdf-viewer";
import { ReadingProgress } from "./reading-progress";
import { ReadingTracker } from "./reading-tracker";

type Props = { params: Promise<{ id: string }> };

/** Strip LinkedIn reactions/comments and reformat post content for readability */
function cleanLinkedInHtml(html: string, url: string): string {
  if (!/linkedin\.com/.test(url)) return html;

  // 1. Strip everything from "Reactions" / "Comments" section onward
  const stripPatterns = [
    /<[a-z][^>]*>\s*Reactions\s*<\/[a-z]+>\s*[\s\S]*/i,
    /<[a-z][^>]*>\s*Comments\s*<\/[a-z]+>\s*[\s\S]*/i,
    /<[a-z][^>]*>\s*Activity\s*<\/[a-z]+>\s*[\s\S]*/i,
    /<[a-z][^>]*>\s*<[a-z][^>]*>\s*Reactions\s*<\/[a-z]+>\s*<\/[a-z]+>\s*[\s\S]*/i,
    /<[a-z][^>]*>\s*<[a-z][^>]*>\s*Comments\s*<\/[a-z]+>\s*<\/[a-z]+>\s*[\s\S]*/i,
  ];
  let cleaned = html;
  for (const pat of stripPatterns) {
    cleaned = cleaned.replace(pat, "");
  }

  // 2. Extract plain text from the cleaned HTML, then reformat with structure
  // Decode entities BEFORE stripping tags so entity-encoded markup gets caught
  const text = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  if (!text) return cleaned;

  // 3. Rebuild as formatted HTML with proper paragraphs and lists
  // Filter out empty lines but track gaps for paragraph breaks
  const rawLines = text.split(/\n/);
  const lines: { text: string; gapBefore: boolean }[] = [];
  let gap = false;
  for (const raw of rawLines) {
    const t = raw.trim();
    if (!t) { gap = true; continue; }
    lines.push({ text: t, gapBefore: gap });
    gap = false;
  }

  const blocks: string[] = [];
  let currentList: string[] = [];
  let listType: "ol" | "ul" | null = null;

  function flushList() {
    if (currentList.length > 0 && listType) {
      blocks.push(`<${listType}>${currentList.map(li => `<li>${li}</li>`).join("")}</${listType}>`);
      currentList = [];
      listType = null;
    }
  }

  function isListItem(t: string): "ol" | "ul" | null {
    if (/^\d+\.\s+/.test(t)) return "ol";
    if (/^[-•·]\s+/.test(t)) return "ul";
    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    const { text: line, gapBefore } = lines[i];

    const itemType = isListItem(line);

    // If we're in a list and hit a gap, only flush if next line isn't the same list type
    if (gapBefore && listType && itemType !== listType) {
      flushList();
    }

    if (itemType === "ol") {
      if (listType !== "ol") flushList();
      listType = "ol";
      currentList.push(line.replace(/^\d+\.\s+/, ""));
      continue;
    }

    if (itemType === "ul") {
      if (listType !== "ul") flushList();
      listType = "ul";
      currentList.push(line.replace(/^[-•·]\s+/, ""));
      continue;
    }

    flushList();

    // Short lines without ending punctuation → subheading
    if (line.length < 80 && !/[.!?:,;'"]$/.test(line) && /[A-Z]/.test(line[0])) {
      blocks.push(`<h3>${line}</h3>`);
    } else {
      blocks.push(`<p>${line}</p>`);
    }
  }
  flushList();

  return blocks.join("\n");
}

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

  // Fix missing title: if title is empty or just a URL, try to extract it
  const titleIsUrl = !bookmark.title || /^https?:\/\//.test(bookmark.title);
  // For tweets, also detect "@handle: https://..." pattern (tweet text was just a link)
  const tweetTitleIsUrl = bookmark.type === "tweet" &&
    bookmark.title && /^@\w+:\s*https?:\/\//.test(bookmark.title);
  let displayTitle = bookmark.title || bookmark.url;
  if (tweetTitleIsUrl) {
    // Extract the URL from the title and resolve the linked article's title
    const urlMatch = bookmark.title.match(/https?:\/\/\S+/);
    if (urlMatch) {
      try {
        const linkedTitle = await resolveTweetLinkTitle(urlMatch[0], bookmark.url);
        if (linkedTitle) {
          displayTitle = linkedTitle;
          updateBookmark(id, { title: linkedTitle }).catch(() => {});
        }
      } catch {
        // keep existing title
      }
    }
  } else if (titleIsUrl) {
    try {
      const meta = await extractMetadata(bookmark.url);
      if (meta.title) {
        displayTitle = meta.title;
        // Persist so it's fixed for next time
        updateBookmark(id, { title: meta.title }).catch(() => {});
      }
    } catch {
      // keep URL as fallback
    }
  }

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
          <AnalyzeButton bookmarkId={id} />
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
          <h1>{displayTitle}</h1>
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
          // Prefer archived content (clean blockquote) over raw type_metadata
          // which can contain engagement metrics (reply/retweet/like counts)
          let contentHtml = archived?.content_html
            ? String(archived.content_html)
            : bookmark.type_metadata?.content_html
              ? String(bookmark.type_metadata.content_html)
              : "";
          // Strip tweet engagement metrics (reply/retweet/like/view counts)
          // These appear as short elements containing just numbers like "3", "26", "2.6K"
          if (contentHtml && !archived?.content_html) {
            contentHtml = contentHtml
              .replace(/<(p|div|span|h[1-6])[^>]*>\s*[\d,.]+[KkMm]?\s*<\/\1>/g, "")
              .replace(/<(p|div|span|h[1-6])[^>]*>\s*<\/\1>/g, "")
              .trim();
          }
          // Improve readability: split <p> blocks containing <br> into separate paragraphs
          if (contentHtml) {
            contentHtml = contentHtml.replace(
              /<p>([\s\S]*?)<\/p>/g,
              (_match: string, inner: string) => {
                const parts = inner.split(/<br\s*\/?>/i).map((s: string) => s.trim()).filter(Boolean);
                if (parts.length <= 1) return `<p>${inner}</p>`;
                return parts.map((p: string) => `<p>${p}</p>`).join("\n");
              }
            );
          }
          const tweetText =
            bookmark.description ||
            (bookmark.type_metadata?.tweet_text ? String(bookmark.type_metadata.tweet_text) : "") ||
            bookmark.title;
          // Collect media images not already embedded in content_html
          const mediaUrls: string[] = Array.isArray(bookmark.type_metadata?.media_urls)
            ? (bookmark.type_metadata.media_urls as string[]).filter(
                (u: string) => {
                  if (!u.includes("pbs.twimg.com")) return false;
                  // Check by path to avoid duplicates (extension may clean URLs)
                  try { const p = new URL(u).pathname; return !contentHtml.includes(p); } catch { return !contentHtml.includes(u); }
                }
              )
            : [];
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
              {mediaUrls.length > 0 && (
                <div className="reader-tweet-media">
                  {mediaUrls.map((src: string, i: number) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="Tweet media" className="reader-tweet-img" />
                  ))}
                </div>
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
        })() : bookmark.type === "video" || bookmark.type === "podcast" ? (
          <div className="reader-video">
            {(bookmark.url.includes("youtube.com") || bookmark.url.includes("youtu.be")) && (
              <iframe
                className="reader-video-embed"
                src={`https://www.youtube.com/embed/${getYouTubeId(bookmark.url)}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={bookmark.title}
              />
            )}
            {bookmark.type === "podcast" && !(bookmark.url.includes("youtube.com") || bookmark.url.includes("youtu.be")) && (
              <p>
                <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="reader-video-link">
                  Listen to episode &rarr;
                </a>
              </p>
            )}
            <EnrichmentBlock bookmarkId={id} enrichment={enrichment} />
            {archived?.content_text && (
              <details className="transcript-details">
                <summary>View full transcript</summary>
                <div className="transcript-content">
                  {archived.content_text}
                </div>
              </details>
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
            dangerouslySetInnerHTML={{ __html: cleanLinkedInHtml(archived.content_html, bookmark.url) }}
          />
        ) : (
          <div className="reader-empty">
            <p>We couldn&rsquo;t extract this article.</p>
            <p>
              Use <strong>capture page</strong> above to grab it via the extension,
              or try <strong>web archive</strong> for a cached version.
            </p>
            <p>
              You can also view the{" "}
              <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
                original page
              </a>
              .
            </p>
          </div>
        )}
      </article>

      {bookmark.type !== "video" && bookmark.type !== "podcast" && (
        <EnrichmentBlock bookmarkId={id} enrichment={enrichment} />
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
