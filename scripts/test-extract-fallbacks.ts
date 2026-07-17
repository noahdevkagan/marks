// Test the extraction fallback chain against real URLs that are known to
// block server-side fetches (bot walls / paywalls).
//
// Run: npx tsx scripts/test-extract-fallbacks.ts [url]

import {
  extractArticle,
  extractViaArchive,
  extractFromHtml,
} from "../lib/extract";

const DEFAULT_URL =
  "https://www.texasmonthly.com/travel/biking-i-35-hell-route-austin-to-san-antonio/";

// Offline checks: bot-wall pages must be rejected (return null) so the
// fallback chain runs, while real articles still parse.
function testBlockPageDetection() {
  const para = (s: string) => `<p>${s}</p>`;

  const bloombergWall = `<html><head><title>Bloomberg - Are you a robot?</title></head><body><article>
    ${para("We've detected unusual activity from your computer network")}
    ${para("To continue, please click the box below to let us know you're not a robot.")}
    ${para("Why did this happen?")}
    ${para("Please make sure your browser supports JavaScript and cookies and that you are not blocking them from loading. For more information you can review our Terms of Service and Cookie Policy.")}
  </article></body></html>`;

  if (extractFromHtml(bloombergWall, "https://www.bloomberg.com/news/articles/x") !== null) {
    console.error("FAIL: Bloomberg bot wall was not rejected");
    process.exit(1);
  }

  const cloudflareWall = `<html><head><title>Just a moment...</title></head><body><article>
    ${para("Checking your browser before accessing example.com.")}
    ${para("This process is automatic. Your browser will redirect to your requested content shortly. Please allow up to 5 seconds. Enable JavaScript and cookies to continue browsing as expected.")}
    ${para("DDoS protection requires verifying you are a human before proceeding to the site.")}
  </article></body></html>`;

  if (extractFromHtml(cloudflareWall, "https://example.com/post") !== null) {
    console.error("FAIL: Cloudflare interstitial was not rejected");
    process.exit(1);
  }

  // archive.today "One more step" reCAPTCHA interstitial — must be rejected so
  // a captured challenge page is never saved as article content.
  const archiveChallenge = `<html><head><title>archive.is</title></head><body>
    ${para("One more step")}
    ${para("Please complete the security check to access archive.is")}
    ${para("Why do I have to complete a CAPTCHA? Completing the CAPTCHA proves you are a human and gives you temporary access.")}
  </article></body></html>`;

  if (extractFromHtml(archiveChallenge, "https://archive.is/newest/https://example.com/x") !== null) {
    console.error("FAIL: archive.today reCAPTCHA interstitial was not rejected");
    process.exit(1);
  }

  // A long real article that *mentions* bot detection must NOT be rejected
  const filler = para(
    "Publishers have spent the last decade in an arms race with scrapers. ".repeat(12),
  );
  const articleAboutBots = `<html><head><title>How CAPTCHAs Took Over the Web</title></head><body><article>
    ${para("Every reader has seen the phrase: to continue, prove you're not a robot.")}
    ${filler.repeat(8)}
  </article></body></html>`;

  const parsed = extractFromHtml(articleAboutBots, "https://example.com/captchas");
  if (parsed === null) {
    console.error("FAIL: real article mentioning bot detection was rejected");
    process.exit(1);
  }

  console.log("OK: block-page detection (3 walls rejected, 1 real article kept)\n");
}

async function main() {
  testBlockPageDetection();

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
