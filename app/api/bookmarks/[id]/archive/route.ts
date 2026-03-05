import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmark, updateBookmark, getAllTags, setBookmarkTags } from "@/lib/db";
import {
  extractArticle,
  extractViaArchive,
  extractFromHtml,
  extractMediaUrls,
} from "@/lib/extract";
import { createClient } from "@/lib/supabase-server";
import { textToHtml } from "@/lib/pdf-html";
import { uploadToStorage } from "@/lib/storage";
import { enrichArticle, enrichTweet } from "@/lib/ai";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    const bookmark = await getBookmark(id);
    if (!bookmark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const forceArchive = body.force_archive === true;
    const pageHtml = body.page_html as string | undefined;

    // Archive tweets: if page_html provided (e.g. from archive.today), extract full content
    // Otherwise preserve stored text + download media images as durable backup
    if (bookmark.type === "tweet" && !pageHtml) {
      const supabase = await createClient();
      const tweetText = bookmark.description || bookmark.title || "";
      const author = bookmark.type_metadata?.author
        ? String(bookmark.type_metadata.author)
        : "";
      const wordCount = tweetText.split(/\s+/).filter(Boolean).length;

      // Build HTML representation of the tweet
      const tweetHtml = `<blockquote><p>${tweetText.replace(/\n/g, "<br>")}</p>${author ? `<footer>— @${author}</footer>` : ""}</blockquote>`;

      await supabase.from("archived_content").upsert(
        {
          bookmark_id: id,
          content_html: tweetHtml,
          content_text: tweetText,
          excerpt: tweetText.slice(0, 200),
          byline: author ? `@${author}` : null,
          word_count: wordCount,
          source: "tweet",
        },
        { onConflict: "bookmark_id" },
      );

      await updateBookmark(id, { is_archived: true });

      // Store tweet text and download media images to durable storage
      try {
        await uploadToStorage(
          user.id,
          id,
          "content.txt",
          tweetText,
          "text/plain",
          "text_archive",
          bookmark.url,
        );

        // Download and store tweet media images
        const mediaUrls = (bookmark.type_metadata?.media_urls as string[]) ?? [];
        for (let i = 0; i < mediaUrls.length; i++) {
          try {
            const imgRes = await fetch(mediaUrls[i], {
              signal: AbortSignal.timeout(10000),
            });
            if (imgRes.ok) {
              const buffer = Buffer.from(await imgRes.arrayBuffer());
              const ct = imgRes.headers.get("content-type") || "image/jpeg";
              const ext = ct.includes("png")
                ? "png"
                : ct.includes("webp")
                  ? "webp"
                  : "jpg";
              await uploadToStorage(
                user.id,
                id,
                `media-${i}.${ext}`,
                buffer,
                ct,
                "tweet_media",
                mediaUrls[i],
              );
            }
          } catch {
            // individual image download failed, continue with others
          }
        }
      } catch (storageErr) {
        console.error("Tweet storage error:", storageErr);
      }

      return NextResponse.json({
        ok: true,
        source: "tweet",
        word_count: wordCount,
        excerpt: tweetText.slice(0, 200),
      });
    }

    // If pre-fetched HTML provided (e.g. from Chrome extension), parse it directly
    // Otherwise fall back to server-side fetch
    let article;
    if (pageHtml && pageHtml.length > 500) {
      article = extractFromHtml(pageHtml, bookmark.url);
    }

    if (!article) {
      article = forceArchive
        ? await extractViaArchive(bookmark.url)
        : await extractArticle(bookmark.url);
    }

    if (!article) {
      return NextResponse.json(
        { error: "Could not extract article content" },
        { status: 422 },
      );
    }

    // Upsert into archived_content
    const supabase = await createClient();
    const { error } = await supabase.from("archived_content").upsert(
      {
        bookmark_id: id,
        content_html: article.content_html,
        content_text: article.content_text,
        excerpt: article.excerpt,
        byline: article.byline,
        word_count: article.word_count,
        source: article.source,
      },
      { onConflict: "bookmark_id" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark bookmark as archived
    await updateBookmark(id, { is_archived: true });

    // Upload HTML archive to Supabase Storage as durable backup
    try {
      await uploadToStorage(
        user.id,
        id,
        "archive.html",
        article.content_html,
        "text/html",
        "html_archive",
        bookmark.url,
      );

      // Also store plain text for offline reading
      if (article.content_text) {
        await uploadToStorage(
          user.id,
          id,
          "content.txt",
          article.content_text,
          "text/plain",
          "text_archive",
          bookmark.url,
        );
      }

      // Try to download and store og:image as thumbnail
      const media = extractMediaUrls(article.content_html);
      const imageUrl = media.ogImage || media.images[0];
      if (imageUrl) {
        try {
          const imgRes = await fetch(imageUrl, {
            signal: AbortSignal.timeout(10000),
          });
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const ct = imgRes.headers.get("content-type") || "image/jpeg";
            const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
            await uploadToStorage(
              user.id,
              id,
              `thumbnail.${ext}`,
              buffer,
              ct,
              "thumbnail",
              imageUrl,
            );
          }
        } catch {
          // thumbnail download failed, not critical
        }
      }
    } catch (storageErr) {
      console.error("Storage upload error:", storageErr);
      // storage upload failed, archive still works via Postgres
    }

    // Auto-enrich after successful archive (inline, not fire-and-forget)
    try {
      const existingTags = await getAllTags();
      const tagNames = existingTags.map((t) => t.name);

      let enrichment: {
        summary: string;
        action_items: { text: string; url?: string }[];
        tags: string[];
      };

      if (bookmark.type === "tweet") {
        // Use full archived text if available (e.g. from archive.today), fall back to stored description
        const tweetText = article?.content_text || bookmark.description || bookmark.title || "";
        const handleMatch = bookmark.title.match(/^@(\w+):/);
        const handle = handleMatch?.[1] || "";
        enrichment = await enrichTweet(tweetText, handle, tagNames);
      } else {
        const contentText = article.content_text || bookmark.description || "";
        enrichment = await enrichArticle(contentText, bookmark.title, tagNames);
      }

      // Upsert enrichment data
      await supabase.from("bookmark_enrichments").upsert(
        {
          bookmark_id: id,
          summary: enrichment.summary,
          action_items: enrichment.action_items.map((a) => ({
            text: a.text,
            url: a.url || null,
            completed: false,
            created_at: new Date().toISOString(),
          })),
          ai_tags: enrichment.tags,
          model: "claude-3-haiku-20240307",
          processed_at: new Date().toISOString(),
        },
        { onConflict: "bookmark_id" },
      );

      // Merge AI tags into bookmark's tags
      const currentTags = bookmark.tags ?? [];
      const mergedTags = [...new Set([...currentTags, ...enrichment.tags])];
      await setBookmarkTags(id, mergedTags);
    } catch (enrichErr) {
      console.error("Enrichment error:", enrichErr);
      // enrichment failed, archive still succeeded
    }

    return NextResponse.json({
      ok: true,
      source: article.source,
      word_count: article.word_count,
      excerpt: article.excerpt,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Re-process archived PDF content through the improved textToHtml formatter */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    const supabase = await createClient();
    const { data: archived } = await supabase
      .from("archived_content")
      .select("content_text, source")
      .eq("bookmark_id", id)
      .single();

    if (!archived?.content_text) {
      return NextResponse.json({ error: "No archived text to reprocess" }, { status: 404 });
    }

    const contentHtml = textToHtml(archived.content_text);
    const { error } = await supabase
      .from("archived_content")
      .update({ content_html: contentHtml })
      .eq("bookmark_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, htmlLength: contentHtml.length });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
