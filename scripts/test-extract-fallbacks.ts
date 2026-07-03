// Test the extraction fallback chain against real URLs that are known to
// block server-side fetches (bot walls / paywalls).
//
// Run: npx tsx scripts/test-extract-fallbacks.ts [url]

import { extractArticle, extractViaArchive } from "../lib/extract";

const DEFAULT_URL =
  "https://www.texasmonthly.com/travel/biking-i-35-hell-route-austin-to-san-antonio/";

async function main() {
  const url = process.argv[2] || DEFAULT_URL;

  console.log(`Extracting: ${url}\n`);

  const start = Date.now();
  const article = await extractArticle(url);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!article) {
    console.error(`FAIL: extractArticle returned null (${elapsed}s)`);

    console.log("\nTrying extractViaArchive (force_archive path)...");
    const archived = await extractViaArchive(url);
    if (!archived) {
      console.error("FAIL: extractViaArchive also returned null");
      process.exit(1);
    }
    report(archived);
    return;
  }

  console.log(`OK (${elapsed}s)`);
  report(article);
}

function report(article: {
  title: string;
  source: string;
  word_count: number;
  byline: string;
  excerpt: string;
}) {
  console.log(`  source:     ${article.source}`);
  console.log(`  title:      ${article.title}`);
  console.log(`  byline:     ${article.byline || "(none)"}`);
  console.log(`  word_count: ${article.word_count}`);
  console.log(`  excerpt:    ${article.excerpt.slice(0, 120)}...`);

  if (article.word_count < 100) {
    console.error("FAIL: suspiciously short content");
    process.exit(1);
  }
}

main();
