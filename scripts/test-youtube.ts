import {
  extractYouTubeId,
  fetchYouTubeTranscript,
  fetchYouTubeMetadata,
  findQuoteTimestamp,
  formatTimestamp,
} from "../lib/youtube";

async function main() {
  console.log("=== YouTube URL Parsing ===");
  const urls = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://example.com/page",
  ];
  for (const url of urls) {
    console.log(`  ${url} → ${extractYouTubeId(url)}`);
  }

  console.log("\n=== Timestamp Formatting ===");
  console.log(`  0 → ${formatTimestamp(0)}`);
  console.log(`  65 → ${formatTimestamp(65)}`);
  console.log(`  3661 → ${formatTimestamp(3661)}`);

  // Test with a real video that has captions
  const testVideoId = "dQw4w9WgXcQ";
  console.log(`\n=== Fetching metadata for ${testVideoId} ===`);
  const metadata = await fetchYouTubeMetadata(
    `https://www.youtube.com/watch?v=${testVideoId}`,
  );
  console.log("  Metadata:", metadata);

  console.log(`\n=== Fetching transcript for ${testVideoId} ===`);
  const transcript = await fetchYouTubeTranscript(testVideoId);
  if (transcript) {
    console.log(`  Got ${transcript.segments.length} segments`);
    console.log(`  Total chars: ${transcript.text.length}`);
    console.log(`  First 200 chars: ${transcript.text.slice(0, 200)}`);
    console.log(`  First 3 segments:`, transcript.segments.slice(0, 3));

    // Test quote finding
    if (transcript.segments.length > 5) {
      const testQuote = transcript.segments[5].text;
      const ts = findQuoteTimestamp(testQuote, transcript.segments);
      console.log(
        `\n  Quote timestamp test: "${testQuote}" → ${ts !== null ? formatTimestamp(ts) : "not found"}`,
      );
    }
  } else {
    console.log("  No transcript available");
  }

  console.log("\nDone!");
}

main().catch(console.error);
