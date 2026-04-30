import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBookmark } from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { getSignedUrl } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    const bookmark = await getBookmark(id);
    if (!bookmark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (bookmark.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();

    const { data: media } = await supabase
      .from("stored_media")
      .select("storage_path")
      .eq("bookmark_id", id)
      .eq("media_type", "pdf_upload")
      .single();

    const storagePath = media?.storage_path;
    if (!storagePath) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }

    const signedUrl = await getSignedUrl(storagePath);
    if (!signedUrl) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }

    // Check if client wants a redirect (browser navigation) or proxied data (react-pdf)
    const wantsProxy = req.headers.get("accept")?.includes("application/pdf") ||
      req.headers.get("sec-fetch-dest") === "empty";

    if (wantsProxy) {
      // Proxy the PDF data to avoid CORS issues with cross-origin redirects
      const pdfRes = await fetch(signedUrl);
      if (!pdfRes.ok) {
        return NextResponse.json({ error: "PDF fetch failed" }, { status: 502 });
      }
      const pdfData = await pdfRes.arrayBuffer();
      return new NextResponse(pdfData, {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    return NextResponse.redirect(signedUrl);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to serve PDF" }, { status: 500 });
  }
}
