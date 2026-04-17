import { getBookmarks, getAllTags, getLibraryStats } from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { Landing } from "./landing";
import { Library } from "./library";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <Landing />;
  }

  const params = await searchParams;
  const tag = params.tag;
  const page = parseInt(params.page ?? "1", 10);

  const [{ bookmarks, total }, allTags, stats] = await Promise.all([
    getBookmarks({ tag, page }),
    getAllTags(),
    getLibraryStats(),
  ]);

  const totalPages = Math.ceil(total / 50);

  return (
    <Library
      bookmarks={bookmarks}
      total={total}
      totalPages={totalPages}
      page={page}
      tag={tag}
      allTags={allTags}
      stats={stats}
    />
  );
}
