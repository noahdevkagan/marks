import { createClient } from "@supabase/supabase-js";
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

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

// Minimal DOM parser for extracting title
import { parseHTML } from "linkedom";

function extractTitle(html: string): string {
  try {
    const { document: doc } = parseHTML(html);
    const ogTitle = doc
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content");
    const titleEl = doc.querySelector("title")?.textContent;
    return (ogTitle || titleEl || "").trim();
  } catch {
    return "";
  }
}

async function fetchTitle(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return extractTitle(html);
  } catch {
    return "";
  }
}

async function main() {
  // Find all bookmarks where title is empty or looks like a URL
  const { data: bookmarks, error } = await supabase
    .from("bookmarks")
    .select("id, url, title")
    .or("title.is.null,title.like.http://%,title.like.https://%,title.eq.");

  if (error) {
    console.error("Query error:", error.message);
    process.exit(1);
  }

  const allBookmarks = bookmarks || [];
  console.log(`Found ${allBookmarks.length} bookmarks needing titles`);

  if (allBookmarks.length === 0) {
    console.log("Nothing to backfill!");
    return;
  }

  let fixed = 0;
  let failed = 0;
  const BATCH = 5; // concurrent requests

  for (let i = 0; i < allBookmarks.length; i += BATCH) {
    const batch = allBookmarks.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (b) => {
        const title = await fetchTitle(b.url);
        if (title && title !== b.title) {
          const { error } = await supabase
            .from("bookmarks")
            .update({ title })
            .eq("id", b.id);
          if (!error) {
            console.log(`  ✓ [${b.id}] ${title}`);
            return true;
          } else {
            console.log(`  ✗ [${b.id}] DB error: ${error.message}`);
            return false;
          }
        } else {
          console.log(`  - [${b.id}] could not extract title from ${b.url}`);
          return false;
        }
      }),
    );
    fixed += results.filter(Boolean).length;
    failed += results.filter((r) => !r).length;
  }

  console.log(`\nDone: ${fixed} fixed, ${failed} failed`);
}

main();
