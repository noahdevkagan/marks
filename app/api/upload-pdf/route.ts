import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createBookmark, updateBookmark } from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { textToHtml } from "@/lib/pdf-html";
// Import from lib directly to avoid pdf-parse's debug mode test file issue on Vercel
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const body = await req.json();
    const { storagePath, filename, fileSize } = body as {
      storagePath: string;
      filename: string;
      fileSize: number;
    };

    if (!storagePath || !filename) {
      return NextResponse.json({ error: "Missing storagePath or filename" }, { status: 400 });
    }

    // Download PDF from Supabase Storage to extract text
    const supabase = await createClient();
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("user-files")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return NextResponse.json({ error: "Could not read uploaded file" }, { status: 500 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Extract text from PDF
    let contentText = "";
    let pageCount = 0;
    try {
      const parsed = await pdfParse(buffer);
      contentText = parsed.text || "";
      pageCount = parsed.numpages || 0;
    } catch (parseErr) {
      console.error("PDF parse error:", parseErr);
    }

    const displayTitle = filename.replace(/\.pdf$/i, "");
    const wordCount = contentText.split(/\s+/).filter(Boolean).length;

    // Create bookmark entry
    const bookmark = await createBookmark({
      url: `pdf://upload/${encodeURIComponent(filename)}`,
      title: displayTitle,
      type: "pdf",
      type_metadata: {
        original_filename: filename,
        file_size: fileSize || buffer.length,
        page_count: pageCount,
        uploaded: true,
      },
      user_id: user.id,
    });

    // Record in stored_media table
    await supabase.from("stored_media").insert({
      bookmark_id: bookmark.id,
      user_id: user.id,
      storage_path: storagePath,
      media_type: "pdf_upload",
      original_url: null,
      file_size: fileSize || buffer.length,
      content_type: "application/pdf",
    });

    // Increment storage usage
    await supabase.rpc("increment_storage_usage", {
      p_user_id: user.id,
      p_bytes: fileSize || buffer.length,
    });

    // Store extracted text as archived content for clean reading
    if (contentText.trim().length > 50) {
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
