import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicBookmarkBySlug } from "@/lib/db";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const bookmark = await getPublicBookmarkBySlug(slug);
  if (!bookmark) {
    return { title: "Shared on Marks" };
  }
  const owner = bookmark.owner_display || "Someone";
  const title = bookmark.title || "Shared article";
  const description =
    bookmark.archived?.excerpt ||
    bookmark.description ||
    `${owner} shared this article on Marks`;
  const url = `https://getmarks.app/s/${slug}`;

  return {
    title: `${title} — shared on Marks`,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Marks",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
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

export default async function PublicSharePage({ params }: Props) {
  const { slug } = await params;
  const bookmark = await getPublicBookmarkBySlug(slug);
  if (!bookmark) notFound();

  const owner = bookmark.owner_display || "Someone";
  const archived = bookmark.archived;
  const wordCount = archived?.word_count ?? 0;
  let domain = "";
  try {
    domain = new URL(bookmark.url).hostname.replace("www.", "");
  } catch {
    domain = "";
  }

  return (
    <div className="public-share-wrapper">
      <header className="public-share-header">
        <Link href="/" className="public-share-logo">
          <span aria-hidden>📑</span> Marks
        </Link>
        <Link href={`/signup?save=${slug}`} className="public-share-signup-link">
          Sign up free
        </Link>
      </header>

      <div className="public-share-banner">
        <div className="public-share-banner-left">
          <span className="public-share-avatar" aria-hidden>
            {owner.charAt(0).toUpperCase()}
          </span>
          <span>
            Shared from <strong>{owner}&rsquo;s</strong> library on Marks
          </span>
        </div>
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="public-share-original"
        >
          View original →
        </a>
      </div>

      <article className="reader-container public-share-article">
        <header className="reader-header">
          <h1>{bookmark.title || bookmark.url}</h1>
          {archived?.byline && <p className="reader-byline">{archived.byline}</p>}
          <div className="reader-meta">
            {domain && <span>{domain}</span>}
            {wordCount > 0 && (
              <>
                <span>&middot;</span>
                <span>{wordCount.toLocaleString()} words</span>
                <span>&middot;</span>
                <span>{Math.ceil(wordCount / 250)} min read</span>
              </>
            )}
          </div>
        </header>

        {bookmark.type === "video" ? (
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
            {archived?.content_text && (
              <details className="transcript-details">
                <summary>View full transcript</summary>
                <div className="transcript-content">{archived.content_text}</div>
              </details>
            )}
          </div>
        ) : bookmark.type === "image" ? (
          <div className="reader-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bookmark.url}
              alt={bookmark.title || "Shared image"}
              className="reader-image-full"
            />
          </div>
        ) : archived?.content_html ? (
          <div
            className="reader-content"
            dangerouslySetInnerHTML={{ __html: archived.content_html }}
          />
        ) : (
          <div className="reader-empty">
            <p>This article hasn&rsquo;t been archived yet.</p>
            <p>
              <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
                Read it on {domain || "the original site"} →
              </a>
            </p>
          </div>
        )}
      </article>

      <div className="public-share-cta">
        <div className="public-share-cta-text">
          <strong>Want to save articles like this?</strong>
          <span>Marks is a private bookmark tracker. Free forever.</span>
        </div>
        <Link href={`/signup?save=${slug}`} className="public-share-cta-btn">
          Save this to my library →
        </Link>
      </div>
    </div>
  );
}
