import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createBookmark, updateBookmark } from "@/lib/db";
import { uploadToStorage } from "@/lib/storage";
import { createClient } from "@/lib/supabase-server";
// Import from lib directly to avoid pdf-parse's debug mode test file issue on Vercel
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");

export const maxDuration = 60;

/** Escape HTML entities in plain text */
function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Join PDF lines into flowing text, handling word hyphenation at line breaks */
function joinLines(lines: string[]): string {
  if (lines.length === 0) return "";
  let result = lines[0];
  for (let i = 1; i < lines.length; i++) {
    // Word hyphenated across lines: "competi-\ntive" → "competitive"
    if (result.endsWith("-") && /^[a-z]/.test(lines[i])) {
      result = result.slice(0, -1) + lines[i];
    } else {
      result += " " + lines[i];
    }
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

/** Detect if a short block of text looks like a section heading */
function isHeading(text: string, lineCount: number): boolean {
  if (text.length > 120 || lineCount > 2) return false;
  // Ends with sentence-ending punctuation → probably not a heading
  if (/[.!?:,;]$/.test(text)) return false;
  // All caps (at least 2 letters)
  if (text === text.toUpperCase() && /[A-Z]{2}/.test(text)) return true;
  // Numbered section: "1. Title", "1.1 Title", "2.1.3 Title"
  if (/^\d+(\.\d+)*\.?\s+\S/.test(text) && text.length < 80) return true;
  // Roman numeral section: "I. Title", "IV. Title"
  if (/^[IVXLC]+\.\s+\S/.test(text) && text.length < 80) return true;
  // Letter section: "A. Title", "B. Title"
  if (/^[A-Z]\.\s+\S/.test(text) && text.length < 60) return true;
  return false;
}

const BULLET_RE = /^[•▪▸►●◦‣⁃∙○■□–—]\s/;
const HYPHEN_BULLET_RE = /^-\s+\S/;
const NUMBERED_ITEM_RE = /^\d+[\.\)]\s/;

/** Convert extracted PDF plain text into structured HTML */
function textToHtml(text: string): string {
  const cleaned = text.replace(/\f/g, "\n\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = cleaned.split(/\n\s*\n/);
  const html: string[] = [];

  for (const rawBlock of blocks) {
    const lines = rawBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    // Skip standalone page numbers
    if (lines.length === 1 && /^\d{1,4}$/.test(lines[0])) continue;

    // Detect bullet list (all lines start with bullet characters)
    const allBullets =
      lines.length > 1 &&
      lines.every((l) => BULLET_RE.test(l) || HYPHEN_BULLET_RE.test(l));
    if (allBullets) {
      const items = lines.map(
        (l) =>
          `<li>${esc(l.replace(/^[•▪▸►●◦‣⁃∙○■□–—-]\s*/, ""))}</li>`,
      );
      html.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    // Detect numbered list (all lines start with "1." / "2)" etc.)
    const allNumbered =
      lines.length > 1 && lines.every((l) => NUMBERED_ITEM_RE.test(l));
    if (allNumbered) {
      const items = lines.map(
        (l) => `<li>${esc(l.replace(/^\d+[\.\)]\s*/, ""))}</li>`,
      );
      html.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }

    // Mixed: intro paragraph followed by bullet items
    const firstBulletIdx = lines.findIndex(
      (l) => BULLET_RE.test(l) || HYPHEN_BULLET_RE.test(l),
    );
    if (
      firstBulletIdx > 0 &&
      lines
        .slice(firstBulletIdx)
        .every((l) => BULLET_RE.test(l) || HYPHEN_BULLET_RE.test(l))
    ) {
      const intro = joinLines(lines.slice(0, firstBulletIdx));
      const items = lines.slice(firstBulletIdx).map(
        (l) =>
          `<li>${esc(l.replace(/^[•▪▸►●◦‣⁃∙○■□–—-]\s*/, ""))}</li>`,
      );
      html.push(`<p>${esc(intro)}</p>\n<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    // Join lines into flowing text (removes arbitrary PDF line breaks)
    const joined = joinLines(lines);
    if (!joined) continue;

    // Heading detection
    if (isHeading(joined, lines.length)) {
      const tag =
        joined === joined.toUpperCase() && /[A-Z]{2}/.test(joined)
          ? "h2"
          : "h3";
      html.push(`<${tag}>${esc(joined)}</${tag}>`);
      continue;
    }

    // Figure / table captions
    if (
      /^(?:Figure|Fig\.|Table|Chart|Exhibit)\s+\d/i.test(joined) &&
      joined.length < 300
    ) {
      html.push(`<p><em>${esc(joined)}</em></p>`);
      continue;
    }

    // Regular paragraph — lines joined with spaces, not <br>
    html.push(`<p>${esc(joined)}</p>`);
  }

  return html.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate PDF
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (50 MB max)" }, { status: 400 });
    }

    const filename = file.name || "document.pdf";
    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text from PDF
    let contentText = "";
    let pageCount = 0;
    try {
      const parsed = await pdfParse(buffer);
      contentText = parsed.text || "";
      pageCount = parsed.numpages || 0;
    } catch (parseErr) {
      console.error("PDF parse error:", parseErr);
      // Continue without extracted text — PDF will still be viewable via iframe
    }

    const displayTitle = title || filename.replace(/\.pdf$/i, "");
    const wordCount = contentText.split(/\s+/).filter(Boolean).length;

    // Create bookmark entry
    const bookmark = await createBookmark({
      url: `pdf://upload/${encodeURIComponent(filename)}`,
      title: displayTitle,
      type: "pdf",
      type_metadata: {
        original_filename: filename,
        file_size: file.size,
        page_count: pageCount,
        uploaded: true,
      },
      user_id: user.id,
    });

    // Upload PDF to storage
    const result = await uploadToStorage(
      user.id,
      bookmark.id,
      "document.pdf",
      buffer,
      "application/pdf",
      "pdf_upload",
    );

    if (!result) {
      return NextResponse.json(
        { error: "Upload failed — check storage quota" },
        { status: 500 },
      );
    }

    // Store extracted text as archived content for clean reading
    if (contentText.trim().length > 50) {
      const supabase = await createClient();
      const contentHtml = textToHtml(contentText);

      await supabase.from("archived_content").upsert(
        {
          bookmark_id: bookmark.id,
          content_html: contentHtml,
          content_text: contentText,
          excerpt: contentText.slice(0, 200),
          byline: null,
          word_count: wordCount,
          source: "pdf",
        },
        { onConflict: "bookmark_id" },
      );

      await updateBookmark(bookmark.id, { is_archived: true });
    }

    return NextResponse.json({ ok: true, bookmark });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PDF upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
