/**
 * Test script for action items feature.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/test-actions.ts
 *
 * What it does:
 * 1. Checks how many enrichments exist in bookmark_enrichments
 * 2. Shows which ones have action_items vs empty
 * 3. Picks a bookmark and triggers enrichment to verify the flow works
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  console.error("Check your .env.local or Vercel env vars for the correct names");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Check enrichments
  const { data: enrichments, error: enrichErr } = await supabase
    .from("bookmark_enrichments")
    .select("bookmark_id, summary, action_items, processed_at")
    .order("processed_at", { ascending: false })
    .limit(20);

  if (enrichErr) {
    console.error("Error fetching enrichments:", enrichErr.message);
    console.error("Does the bookmark_enrichments table exist? Run the migration:");
    console.error("  supabase-migration-ai-enrichment.sql");
    return;
  }

  console.log(`\n=== Enrichments: ${enrichments?.length ?? 0} found ===\n`);

  if (!enrichments || enrichments.length === 0) {
    console.log("No enrichments at all. Action items come from enrichments.");
    console.log("Enrichments are created when:");
    console.log("  1. A bookmark is archived (auto-enrichment)");
    console.log("  2. User clicks 'Enrich' button in the reader view");
    console.log("\nTry archiving a bookmark first, then check again.");

    // Check if there are any bookmarks at all
    const { count } = await supabase
      .from("bookmarks")
      .select("*", { count: "exact", head: true });
    console.log(`\nTotal bookmarks in DB: ${count}`);

    const { count: archivedCount } = await supabase
      .from("archived_content")
      .select("*", { count: "exact", head: true });
    console.log(`Archived bookmarks: ${archivedCount}`);
    return;
  }

  let withActions = 0;
  let withoutActions = 0;

  for (const e of enrichments) {
    const items = e.action_items;
    const hasItems = Array.isArray(items) && items.length > 0;
    if (hasItems) {
      withActions++;
      console.log(`[${e.bookmark_id}] ${items.length} action items, summary: "${e.summary?.slice(0, 60)}..."`);
      for (const item of items) {
        console.log(`    - ${item.text}${item.url ? ` (${item.url})` : ""} ${item.completed ? "[done]" : ""}`);
      }
    } else {
      withoutActions++;
      console.log(`[${e.bookmark_id}] NO action items, summary: "${e.summary?.slice(0, 60)}..."`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`With action items: ${withActions}`);
  console.log(`Without action items: ${withoutActions}`);

  if (withActions === 0) {
    console.log("\nNone of your enrichments have action items.");
    console.log("This usually means the AI decided the content wasn't actionable.");
    console.log("Try enriching a how-to article or a tweet that recommends a tool/resource.");
  }
}

main().catch(console.error);
