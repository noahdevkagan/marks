import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import { getSignedUrl } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    const supabase = await createClient();

    // Try stored_media lookup first
    const { data: media } = await supabase
      .from("stored_media")
      .select("storage_path")
      .eq("bookmark_id", id)
      .eq("media_type", "pdf_upload")
      .single();

    let storagePath = media?.storage_path;

    // Fallback: construct expected path directly
    if (!storagePath) {
      storagePath = `${user.id}/${id}/document.pdf`;
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
