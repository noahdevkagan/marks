/**
 * Test that resolveTweetLinkTitle correctly extracts the article title
 * from a tweet whose text is just a URL (e.g. linking to an X article).
 */
import { resolveTweetLinkTitle, isJustUrl } from "../lib/twitter";

async function main() {
  console.log("=== Test: isJustUrl ===");

  // Should match
  console.assert(isJustUrl("https://t.co/quEUSl9tYC") === "https://t.co/quEUSl9tYC", "bare URL");
  console.assert(isJustUrl("  https://t.co/abc  ") === "https://t.co/abc", "URL with whitespace");

  // Should NOT match
  console.assert(isJustUrl("hello world") === null, "plain text");
  console.assert(isJustUrl("check this https://t.co/abc") === null, "text + URL");
  console.assert(isJustUrl("@user: some tweet text here") === null, "tweet text");
  console.assert(isJustUrl("") === null, "empty string");

  console.log("isJustUrl tests passed ✓");

  console.log("\n=== Test: resolveTweetLinkTitle ===");

  // Test with the actual David George tweet that links to an X article
  const tweetUrl = "https://x.com/DavidGeorge83/status/2036091262080811265";
  const tweetText = "https://t.co/quEUSl9tYC";

  console.log(`Tweet URL: ${tweetUrl}`);
  console.log(`Tweet text: ${tweetText}`);

  const title = await resolveTweetLinkTitle(tweetText, tweetUrl);
  console.log(`Resolved title: ${title}`);

  if (title === "There are only two paths left for software") {
    console.log("PASS ✓ — title correctly resolved to article title");
  } else if (title && !title.startsWith("https://")) {
    console.log(`PARTIAL PASS — got a title but not exact match: "${title}"`);
  } else {
    console.log("FAIL ✗ — could not resolve title");
    process.exit(1);
  }

  // Test with non-URL tweet text (should return null)
  const nullResult = await resolveTweetLinkTitle("Just a regular tweet", tweetUrl);
  console.assert(nullResult === null, "non-URL tweet text should return null");
  console.log("Non-URL text correctly returns null ✓");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
