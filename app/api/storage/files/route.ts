import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import { formatBytes } from "@/lib/storage";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { data: files } = await supabase
      .from("stored_media")
      .select(
        "id, bookmark_id, storage_path, media_type, file_size, content_type, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!files || files.length === 0) {
      return NextResponse.json({ files: [], grouped: [] });
    }

    // Get bookmark titles for display
    const bookmarkIds = [...new Set(files.map((f) => f.bookmark_id))];
    const { data: bookmarks } = await supabase
      .from("bookmarks")
      .select("id, title, url")
      .in("id", bookmarkIds);

    const bookmarkMap = new Map(
      (bookmarks ?? []).map((b) => [b.id, b]),
    );

    // Group files by bookmark
    const groupMap = new Map<
      number,
      {
        bookmark_id: number;
        bookmark_title: string;
        bookmark_url: string;
        total_size: number;
        formatted_size: string;
        files: {
          media_type: string;
          file_size: number;
          formatted_size: string;
          content_type: string;
          created_at: string;
        }[];
      }
    >();

    for (const f of files) {
      const existing = groupMap.get(f.bookmark_id);
      const bk = bookmarkMap.get(f.bookmark_id);
      const fileEntry = {
        media_type: f.media_type,
        file_size: f.file_size,
        formatted_size: formatBytes(f.file_size),
        content_type: f.content_type,
        created_at: f.created_at,
      };

      if (existing) {
        existing.files.push(fileEntry);
        existing.total_size += f.file_size;
        existing.formatted_size = formatBytes(existing.total_size);
      } else {
        groupMap.set(f.bookmark_id, {
          bookmark_id: f.bookmark_id,
          bookmark_title: bk?.title ?? "Untitled",
          bookmark_url: bk?.url ?? "",
          total_size: f.file_size,
          formatted_size: formatBytes(f.file_size),
          files: [fileEntry],
        });
      }
    }

    const grouped = [...groupMap.values()].sort(
      (a, b) => b.total_size - a.total_size,
    );

    return NextResponse.json({
      total_files: files.length,
      total_size: formatBytes(files.reduce((s, f) => s + f.file_size, 0)),
      grouped,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
