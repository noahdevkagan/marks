// Test normalizeUrl — run with: npx tsx scripts/test-normalize-url.ts
import { normalizeUrl } from "../lib/normalize-url";

const cases: [string, string][] = [
  // Tracking params stripped
  [
    "https://example.com/post?utm_source=twitter&utm_medium=social",
    "https://example.com/post",
  ],
  [
    "https://example.com/post?id=5&utm_source=x&fbclid=abc123",
    "https://example.com/post?id=5",
  ],
  ["https://example.com/a?gclid=xyz&mc_eid=123", "https://example.com/a"],
  // Twitter share params stripped, only on x.com/twitter.com
  [
    "https://x.com/naval/status/123?s=46&t=abcdef",
    "https://x.com/naval/status/123",
  ],
  [
    "https://example.com/search?s=46&t=query",
    "https://example.com/search?s=46&t=query",
  ],
  // Trailing slash stripped (root kept)
  ["https://example.com/post/", "https://example.com/post"],
  ["https://example.com/", "https://example.com/"],
  ["https://example.com", "https://example.com/"],
  // Meaningful params and hash untouched
  [
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://example.com/watch?v=dQw4w9WgXcQ",
  ],
  ["https://example.com/doc#section-2", "https://example.com/doc#section-2"],
  // Non-http and garbage pass through unchanged
  ["ftp://example.com/file", "ftp://example.com/file"],
  ["not a url", "not a url"],
  // Idempotent: normalizing twice = normalizing once
  ["https://example.com/post/?utm_campaign=x", "https://example.com/post"],
];

let failed = 0;
for (const [input, expected] of cases) {
  const actual = normalizeUrl(input);
  const twice = normalizeUrl(actual);
  if (actual !== expected) {
    console.error(
      `FAIL: ${input}\n  expected: ${expected}\n  actual:   ${actual}`,
    );
    failed++;
  } else if (twice !== actual) {
    console.error(`FAIL (not idempotent): ${input} → ${actual} → ${twice}`);
    failed++;
  } else {
    console.log(`ok: ${input} → ${actual}`);
  }
}

console.log(
  failed === 0 ? `\nAll ${cases.length} cases passed` : `\n${failed} FAILED`,
);
process.exit(failed === 0 ? 0 : 1);
