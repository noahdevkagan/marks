import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createBookmark, updateBookmark } from "@/lib/db";
import { uploadToStorage } from "@/lib/storage";
import { createClient } from "@/lib/supabase-server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

export const maxDuration = 60;

/** Convert extracted plain text into simple HTML paragraphs */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
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
