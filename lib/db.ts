import { createClient } from "./supabase-server";

export type Bookmark = {
  id: number;
  url: string;
  title: string;
  description: string;
  is_read: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  tags?: string[];
};

export type BookmarkWithTags = Bookmark & { tags: string[] };

const PAGE_SIZE = 50;

export async function getBookmarks(opts: {
  tag?: string;
  page?: number;
  unreadOnly?: boolean;
}): Promise<{ bookmarks: BookmarkWithTags[]; total: number }> {
  const { tag, page = 1, unreadOnly = false } = opts;
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createClient();

  let query = supabase
    .from("bookmarks")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  if (tag) {
    const { data: tagRow } = await supabase
      .from("tags")
      .select("id")
      .eq("name", tag.toLowerCase())
      .single();

    if (!tagRow) return { bookmarks: [], total: 0 };

    const { data: junctionRows } = await supabase
      .from("bookmark_tags")
      .select("bookmark_id")
      .eq("tag_id", tagRow.id);

    const ids = junctionRows?.map((r) => r.bookmark_id) ?? [];
    if (ids.length === 0) return { bookmarks: [], total: 0 };

    query = query.in("id", ids);
  }

  const { data: bookmarks, count } = await query;
  if (!bookmarks) return { bookmarks: [], total: 0 };

  const withTags = await attachTags(bookmarks);
  return { bookmarks: withTags, total: count ?? 0 };
}

export async function getBookmark(
  id: number,
): Promise<BookmarkWithTags | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) return null;

  const [withTags] = await attachTags([data]);
  return withTags;
}

export async function createBookmark(input: {
  url: string;
  title: string;
  description?: string;
  tags?: string[];
  is_read?: boolean;
  created_at?: string;
  user_id: string;
}): Promise<BookmarkWithTags> {
  const { tags = [], ...bookmarkData } = input;
  const supabase = await createClient();

  const { data: bookmark, error } = await supabase
    .from("bookmarks")
    .upsert(
      {
        url: bookmarkData.url,
        title: bookmarkData.title,
        description: bookmarkData.description ?? "",
        is_read: bookmarkData.is_read ?? false,
        user_id: bookmarkData.user_id,
        created_at: bookmarkData.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,url" },
    )
    .select()
    .single();

  if (error || !bookmark) throw error ?? new Error("Failed to create bookmark");

  if (tags.length > 0) {
    await setBookmarkTags(bookmark.id, tags);
  }

  const [withTags] = await attachTags([bookmark]);
  return withTags;
}

export async function updateBookmark(
  id: number,
  input: {
    title?: string;
    url?: string;
    description?: string;
    is_read?: boolean;
    is_archived?: boolean;
    tags?: string[];
  },
): Promise<BookmarkWithTags | null> {
  const { tags, ...fields } = input;
  const supabase = await createClient();

  const { data: bookmark, error } = await supabase
    .from("bookmarks")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error || !bookmark) return null;

  if (tags !== undefined) {
    await setBookmarkTags(id, tags);
  }

  const [withTags] = await attachTags([bookmark]);
  return withTags;
}

export async function deleteBookmark(id: number): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("bookmarks").delete().eq("id", id);
  return !error;
}

// --- Tag helpers ---

async function getOrCreateTag(name: string): Promise<number> {
  const normalized = name.toLowerCase().trim();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("tags")
    .select("id")
    .eq("name", normalized)
    .single();

  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("tags")
    .insert({ name: normalized })
    .select("id")
    .single();

  return created!.id;
}

export async function setBookmarkTags(bookmarkId: number, tagNames: string[]) {
  const supabase = await createClient();

  await supabase.from("bookmark_tags").delete().eq("bookmark_id", bookmarkId);

  if (tagNames.length === 0) return;

  const tagIds = await Promise.all(
    tagNames.map((name) => getOrCreateTag(name)),
  );

  await supabase
    .from("bookmark_tags")
    .insert(
      tagIds.map((tagId) => ({ bookmark_id: bookmarkId, tag_id: tagId })),
    );
}

async function attachTags(bookmarks: Bookmark[]): Promise<BookmarkWithTags[]> {
  if (bookmarks.length === 0) return [];

  const supabase = await createClient();
  const ids = bookmarks.map((b) => b.id);

  const { data } = await supabase
    .from("bookmark_tags")
    .select("bookmark_id, tags(name)")
    .in("bookmark_id", ids);

  if (!data || data.length === 0) {
    return bookmarks.map((b) => ({ ...b, tags: [] }));
  }

  const bookmarkTagMap = new Map<number, string[]>();
  for (const row of data as unknown as {
    bookmark_id: number;
    tags: { name: string };
  }[]) {
    const name = row.tags?.name;
    if (!name) continue;
    const arr = bookmarkTagMap.get(row.bookmark_id) ?? [];
    arr.push(name);
    bookmarkTagMap.set(row.bookmark_id, arr);
  }

  return bookmarks.map((b) => ({
    ...b,
    tags: bookmarkTagMap.get(b.id) ?? [],
  }));
}

export async function getAllTags(): Promise<{ name: string; count: number }[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_tag_counts");

  if (!data) return [];

  return (data as { name: string; count: number }[]).map((row) => ({
    name: row.name,
    count: Number(row.count),
  }));
}
