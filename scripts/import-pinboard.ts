import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load env from .env.local
import { config } from "dotenv";
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type PinboardBookmark = {
  href: string;
  description: string;
  extended: string;
  meta: string;
  hash: string;
  time: string;
  shared: string;
  toread: string;
  tags: string;
};

const BATCH_SIZE = 100;

async function main() {
  const filePath = process.argv[2] ?? "./pinboard_export.json";
  const userId = process.argv[3];

  if (!userId) {
    console.error("Usage: npx tsx scripts/import-pinboard.ts <file> <user-id>");
    console.error(
      "  Get your user ID from Supabase dashboard → Authentication → Users",
    );
    process.exit(1);
  }

  console.log(`Reading ${filePath}...`);
  console.log(`Importing for user: ${userId}`);

  const raw = readFileSync(filePath, "utf-8");
  const all: PinboardBookmark[] = JSON.parse(raw);
  console.log(`Total bookmarks in file: ${all.length}`);

  const bookmarks = all;
  console.log(`Bookmarks to import: ${bookmarks.length}`);

  if (bookmarks.length === 0) {
    console.log("Nothing to import.");
    return;
  }

  // Collect all unique tags
  const allTagNames = new Set<string>();
  for (const b of bookmarks) {
    if (b.tags) {
      for (const t of b.tags.split(/\s+/)) {
        if (t) allTagNames.add(t.toLowerCase());
      }
    }
  }

  console.log(`Unique tags: ${allTagNames.size}`);

  // Upsert all tags
  const tagNameArray = [...allTagNames];
  const tagMap = new Map<string, number>();

  for (let i = 0; i < tagNameArray.length; i += BATCH_SIZE) {
    const batch = tagNameArray.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("tags")
      .upsert(
        batch.map((name) => ({ name })),
        { onConflict: "name" },
      )
      .select("id, name");

    if (error) {
      console.error("Tag upsert error:", error);
      continue;
    }
    for (const row of data ?? []) {
      tagMap.set(row.name, row.id);
    }
  }

  // For any tags not returned by upsert, fetch them
  if (tagMap.size < allTagNames.size) {
    const { data: existingTags } = await supabase
      .from("tags")
      .select("id, name")
      .in("name", tagNameArray);
    for (const row of existingTags ?? []) {
      tagMap.set(row.name, row.id);
    }
  }

  console.log(`Tags in DB: ${tagMap.size}`);

  // Import bookmarks in batches
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < bookmarks.length; i += BATCH_SIZE) {
    const batch = bookmarks.slice(i, i + BATCH_SIZE);

    const rows = batch.map((b) => ({
      url: b.href,
      title: b.description, // Pinboard uses "description" for the title
      description: b.extended, // "extended" is the actual notes/description
      is_read: b.toread !== "yes", // toread=yes means NOT yet read
      created_at: b.time,
      updated_at: b.time,
      user_id: userId,
    }));

    const { data, error } = await supabase
      .from("bookmarks")
      .upsert(rows, { onConflict: "user_id,url" })
      .select("id, url");

    if (error) {
      console.error(`Batch ${i} error:`, error);
      skipped += batch.length;
      continue;
    }

    // Build URL -> ID map for tag linking
    const urlToId = new Map<string, number>();
    for (const row of data ?? []) {
      urlToId.set(row.url, row.id);
    }

    // Link tags
    const junctionRows: { bookmark_id: number; tag_id: number }[] = [];
    for (const b of batch) {
      const bookmarkId = urlToId.get(b.href);
      if (!bookmarkId || !b.tags) continue;

      for (const tagName of b.tags.split(/\s+/)) {
        const tagId = tagMap.get(tagName.toLowerCase());
        if (tagId) {
          junctionRows.push({ bookmark_id: bookmarkId, tag_id: tagId });
        }
      }
    }

    if (junctionRows.length > 0) {
      // Delete existing tag links for these bookmarks, then re-insert
      const batchIds = [...new Set(junctionRows.map((r) => r.bookmark_id))];
      await supabase.from("bookmark_tags").delete().in("bookmark_id", batchIds);

      await supabase.from("bookmark_tags").insert(junctionRows);
    }

    imported += data?.length ?? 0;
    process.stdout.write(`\r  Imported ${imported} / ${bookmarks.length}`);
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
