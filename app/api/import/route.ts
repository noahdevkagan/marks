import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createBookmark } from "@/lib/db";
import { detectBookmarkType } from "@/lib/detect-type";

export const maxDuration = 60;

type ParsedBookmark = {
  url: string;
  title: string;
  folder: string;
  addDate?: string;
};

/**
 * Parse a Netscape Bookmark File (exported from Safari, Chrome, Firefox).
 * The format uses nested <DL><DT><A HREF="...">Title</A> elements.
 * Folder names from <H3> tags become tags.
 */
function parseBookmarkHtml(html: string): ParsedBookmark[] {
  const bookmarks: ParsedBookmark[] = [];
  const folderStack: string[] = [];

  // Process line by line for reliability — regex on full HTML is fragile
  const lines = html.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    // Entering a folder: <DT><H3 ...>Folder Name</H3>
    const folderMatch = trimmed.match(/<H3[^>]*>(.+?)<\/H3>/i);
    if (folderMatch) {
      const folderName = decodeHtmlEntities(folderMatch[1]).trim();
      // Skip Safari's top-level system folders
      if (
        folderName !== "BookmarksBar" &&
        folderName !== "BookmarksMenu" &&
        folderName !== "Bookmarks"
      ) {
        folderStack.push(folderName);
      }
      continue;
    }

    // Closing a folder: </DL>
    if (trimmed.startsWith("</DL>") || trimmed === "</DL><p>") {
      folderStack.pop();
      continue;
    }

    // A bookmark: <DT><A HREF="..." ADD_DATE="..." ...>Title</A>
    const linkMatch = trimmed.match(
      /<A\s+HREF="([^"]+)"([^>]*)>(.+?)<\/A>/i,
    );
    if (linkMatch) {
      const url = linkMatch[1];
      const attrs = linkMatch[2];
      const title = decodeHtmlEntities(linkMatch[3]).trim();

      // Skip Safari built-in bookmarks and javascript: links
      if (
        url.startsWith("javascript:") ||
        url.startsWith("place:") ||
        url.startsWith("about:")
      ) {
        continue;
      }

      // Extract ADD_DATE if present (Unix timestamp)
      const dateMatch = attrs.match(/ADD_DATE="(\d+)"/i);
      const addDate = dateMatch ? dateMatch[1] : undefined;

      const folder =
        folderStack.length > 0
          ? folderStack[folderStack.length - 1].toLowerCase()
          : "";

      bookmarks.push({ url, title, folder, addDate });
    }
  }

  return bookmarks;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 },
      );
    }

    const html = await file.text();
    const parsed = parseBookmarkHtml(html);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "No bookmarks found in file" },
        { status: 422 },
      );
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const bk of parsed) {
      try {
        const type = detectBookmarkType(bk.url);
        const tags = bk.folder ? [bk.folder] : [];

        // Convert Unix timestamp to ISO string
        let createdAt: string | undefined;
        if (bk.addDate) {
          const ts = parseInt(bk.addDate, 10);
          if (ts > 0) {
            createdAt = new Date(ts * 1000).toISOString();
          }
        }

        await createBookmark({
          url: bk.url,
          title: bk.title || bk.url,
          tags,
          user_id: user.id,
          type,
          created_at: createdAt,
        });
        imported++;
      } catch {
        skipped++;
        if (errors.length < 5) {
          errors.push(bk.url);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      total_found: parsed.length,
      imported,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("Import error:", e);
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 },
    );
  }
}
