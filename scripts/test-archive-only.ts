// Force ONLY the archive fallback chain (archive.today Memento → Wayback → Jina),
// skipping the direct readability fetch. Useful for checking whether the
// archive path reaches a snapshot from the current IP — on a residential IP the
// direct fetch usually wins, so this isolates the path the Vercel deploy relies
// on when a publisher's bot wall blocks the server.
//
// Run: npx tsx scripts/test-archive-only.ts [url]

import { extractViaArchive } from "../lib/extract";

const DEFAULT_URL =
  "https://fortune.com/2026/07/16/warren-buffett-google-berkshire-ai-race/";

async function main() {
  const url = process.argv[2] || DEFAULT_URL;
  console.log(`Forcing archive path for: ${url}\n`);

  const start = Date.now();
  const article = await extractViaArchive(url);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!article) {
    console.log(`NULL (${elapsed}s) — every archive fallback returned nothing.`);
    console.log("archive.today / Wayback / Jina all failed from this IP.");
    process.exit(0);
  }

  console.log(`OK (${elapsed}s)`);
  console.log(`  source:     ${article.source}`);
  console.log(`  title:      ${article.title}`);
  console.log(`  byline:     ${article.byline || "(none)"}`);
  console.log(`  word_count: ${article.word_count}`);
  console.log(`  excerpt:    ${article.excerpt.slice(0, 120)}...`);
  console.log();
  if (article.source === "archive.ph") {
    console.log("=> Memento snapshot path WORKS from this IP.");
  } else {
    console.log(
      `=> archive.today did not serve content; recovered via "${article.source}" fallback.`,
    );
  }
}

main();
