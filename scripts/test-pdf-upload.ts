/**
 * End-to-end test of the PDF upload flow (settings page + /api/upload-pdf).
 *
 * This script reproduces what the browser does after the fix:
 *  1. uploads the PDF to Supabase Storage at <user_id>/pdf-uploads/<ts>-<name>
 *  2. parses the PDF with pdf-parse (same code path as the API route)
 *  3. inserts the bookmark + stored_media + archived_content rows
 *  4. cleans up everything it created
 *
 * Run:  npx tsx scripts/test-pdf-upload.ts <path-to-pdf> <user-id>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const [, , filePath, userId] = process.argv;
if (!filePath || !userId) {
  console.error("Usage: npx tsx scripts/test-pdf-upload.ts <pdf-path> <user-id>");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

async function run() {
  const buf = readFileSync(filePath);
  const filename = basename(filePath);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storagePath = `${userId}/pdf-uploads/${Date.now()}-${safeName}`;

  console.log(`PDF: ${filename} (${buf.length} bytes)`);
  console.log(`Path: ${storagePath}`);

  // 1. Upload to storage (matches client-side upload after fix)
  const t0 = Date.now();
  const { error: upErr } = await sb.storage
    .from("user-files")
    .upload(storagePath, buf, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`storage upload: ${upErr.message}`);
  console.log(`✓ uploaded to storage in ${Date.now() - t0}ms`);

  // 2. Re-download (matches what the API route does)
  const { data: dl, error: dlErr } = await sb.storage
    .from("user-files")
    .download(storagePath);
  if (dlErr || !dl) throw new Error(`download: ${dlErr?.message}`);
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  console.log(`✓ downloaded ${dlBuf.length} bytes`);

  // 3. Parse PDF (same call as the API route)
  const t1 = Date.now();
  const parsed = await pdfParse(dlBuf);
  console.log(
    `✓ parsed ${parsed.numpages} pages, ${parsed.text.length} chars in ${Date.now() - t1}ms`,
  );
  console.log(`  excerpt: ${parsed.text.slice(0, 120).replace(/\s+/g, " ").trim()}…`);

  // 4. Insert bookmark
  const { data: bookmark, error: bmErr } = await sb
    .from("bookmarks")
    .insert({
      url: `pdf://upload/${encodeURIComponent(filename)}`,
      title: filename.replace(/\.pdf$/i, ""),
      type: "pdf",
      type_metadata: {
        original_filename: filename,
        file_size: buf.length,
        page_count: parsed.numpages,
        uploaded: true,
      },
      user_id: userId,
    })
    .select()
    .single();
  if (bmErr) throw new Error(`bookmark insert: ${bmErr.message}`);
  console.log(`✓ created bookmark id=${bookmark.id}`);

  // 5. Insert stored_media
  const { error: smErr } = await sb.from("stored_media").insert({
    bookmark_id: bookmark.id,
    user_id: userId,
    storage_path: storagePath,
    media_type: "pdf_upload",
    original_url: null,
    file_size: buf.length,
    content_type: "application/pdf",
  });
  if (smErr) throw new Error(`stored_media: ${smErr.message}`);
  console.log(`✓ stored_media row inserted`);

  // 6. Insert archived_content
  const { error: acErr } = await sb.from("archived_content").upsert(
    {
      bookmark_id: bookmark.id,
      content_html: `<p>${parsed.text.slice(0, 200)}</p>`,
      content_text: parsed.text,
      excerpt: parsed.text.slice(0, 200),
      byline: null,
      word_count: parsed.text.split(/\s+/).filter(Boolean).length,
      source: "pdf",
    },
    { onConflict: "bookmark_id" },
  );
  if (acErr) throw new Error(`archived_content: ${acErr.message}`);
  console.log(`✓ archived_content row inserted`);

  // 7. Clean up
  await sb.from("bookmarks").delete().eq("id", bookmark.id);
  await sb.storage.from("user-files").remove([storagePath]);
  console.log(`✓ cleaned up bookmark + storage object`);

  console.log("\nALL CHECKS PASSED");
}

run().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
