import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

/** Extract valid JSON from an LLM response that may contain markdown fences or trailing text */
function extractJSON(raw: string): string {
  let s = raw.trim();
  // Strip markdown fences
  s = s.replace(/^```json?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "");
  // Find the outermost JSON object or array
  const start = s.search(/[\[{]/);
  if (start === -1) return s;
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === open || c === (open === "{" ? "[" : "{")) depth++;
    if (c === close || c === (close === "}" ? "]" : "}")) depth--;
    if (depth === 0) return s.slice(start, i + 1);
  }
  return s.slice(start);
}

export type ActionItem = {
  text: string;
  url?: string;
};

export type TweetEnrichment = {
  summary: string;
  action_items: ActionItem[];
  tags: string[];
};

export async function suggestBookmarkTags(
  url: string,
  title: string,
  description: string,
  existingTags: string[],
): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `Given this bookmark, suggest 3-5 short topic tags for categorization.

URL: ${url}
Title: ${title}
Description: ${description}

Rules:
- Tags should be lowercase, 1-2 words each
- Focus on the specific topic, not generic words like "article", "blog", "website", "online", "post"
- When a tag from the user's existing list fits well, prefer it over creating a new one
- Only return tags that are genuinely relevant to this specific page

User's existing tags: [${existingTags.slice(0, 80).join(", ")}]

Return ONLY a JSON array of strings, e.g. ["tag1", "tag2", "tag3"]. No markdown fences.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const tags = JSON.parse(extractJSON(text)) as string[];
  return tags.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 0);
}

export type ArticleEnrichment = {
  summary: string;
  action_items: ActionItem[];
  tags: string[];
};

export async function enrichArticle(
  contentText: string,
  title: string,
  existingTags: string[],
): Promise<ArticleEnrichment> {
  // Truncate content to ~4000 chars to keep cost/latency low
  const truncated = contentText.slice(0, 4000);

  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Analyze this article:

Title: ${title}
Content: ${truncated}

Return a JSON object with:
1. "summary": A concise 1-2 sentence summary of the article's key point.
2. "action_items": An array of concrete, actionable takeaways from this article — things the reader could actually do (recipes to try, tools to use, techniques to apply, products to buy, habits to adopt, steps to follow). Each item has "text" and optionally "url" (a relevant link from the article for that action — e.g. a GitHub repo, tool, product page). Return an empty array [] if the content is not actionable (e.g. pure news, opinion pieces, entertainment).
3. "tags": 2-5 topic tags for categorization. Lowercase, no #. Prefer matching from this list when relevant: [${existingTags.slice(0, 50).join(", ")}]. Add new tags only if nothing fits.

Return ONLY valid JSON, no markdown fences.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  return JSON.parse(extractJSON(text)) as ArticleEnrichment;
}

export type VideoEnrichment = {
  hook: string;
  key_insights: string[];
  quotes: { text: string; timestamp?: string }[];
  action_items: ActionItem[];
  tags: string[];
};

/** Map-reduce enrichment for video/podcast transcripts.
 *  Splits transcript into chunks, extracts key points from each,
 *  then consolidates into final enrichment output. */
export async function enrichVideo(
  transcript: string,
  title: string,
  existingTags: string[],
): Promise<VideoEnrichment> {
  const CHUNK_SIZE = 8000;
  const chunks: string[] = [];
  for (let i = 0; i < transcript.length; i += CHUNK_SIZE) {
    chunks.push(transcript.slice(i, i + CHUNK_SIZE));
  }

  // If transcript is short enough, single-pass
  if (chunks.length <= 2) {
    return enrichVideoSinglePass(
      transcript.slice(0, 16000),
      title,
      existingTags,
    );
  }

  // MAP phase: extract key points from each chunk in parallel
  const chunkResults = await Promise.all(
    chunks.map((chunk, i) =>
      extractChunkKeyPoints(chunk, title, i + 1, chunks.length),
    ),
  );

  // REDUCE phase: consolidate all chunk summaries into final enrichment
  const combined = chunkResults.join("\n\n---\n\n");
  return consolidateEnrichment(combined, title, existingTags);
}

async function extractChunkKeyPoints(
  chunk: string,
  title: string,
  chunkNum: number,
  totalChunks: number,
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are analyzing part ${chunkNum}/${totalChunks} of a transcript for "${title}".

Extract from this chunk:
- Key insights or interesting claims (with approximate context)
- Any notable direct quotes worth preserving
- Any actionable advice, tools, or resources mentioned

Transcript chunk:
${chunk}

Return a concise bullet-point summary of the most valuable content in this chunk. If this chunk has nothing notable, just say "No notable content in this section."`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return `[Chunk ${chunkNum}/${totalChunks}]\n${text}`;
}

async function consolidateEnrichment(
  combinedSummaries: string,
  title: string,
  existingTags: string[],
): Promise<VideoEnrichment> {
  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Here are extracted key points from across the full transcript of "${title}":

${combinedSummaries}

The user saved this video but will likely NOT watch it. Extract the full value.

Return a JSON object with:
1. "hook": One compelling sentence for why this is worth the reader's time. Not a summary — a reason to care.
2. "key_insights": Array of 3-5 standalone takeaway strings. Each should make sense on its own without context.
3. "quotes": Array of 2-3 notable direct quotes from the speaker. Each has "text" (the quote).
4. "action_items": Array of concrete actionable things to do — tools to try, techniques to apply, resources to check out. Each has "text" and optionally "url". Empty array if nothing actionable.
5. "tags": 2-5 topic tags. Lowercase. Prefer from: [${existingTags.slice(0, 50).join(", ")}].

Return ONLY valid JSON, no markdown fences.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(extractJSON(text)) as VideoEnrichment;
}

async function enrichVideoSinglePass(
  transcript: string,
  title: string,
  existingTags: string[],
): Promise<VideoEnrichment> {
  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Analyze this video/podcast transcript. The user saved this but will likely NOT watch it — extract the full value.

Title: ${title}
Transcript: ${transcript}

Return a JSON object with:
1. "hook": One compelling sentence for why this is worth the reader's time. Not a summary — a reason to care.
2. "key_insights": Array of 3-5 standalone takeaway strings.
3. "quotes": Array of 2-3 notable direct quotes from the speaker. Each has "text" (the quote).
4. "action_items": Array of concrete actionable things. Each has "text" and optionally "url". Empty array if nothing actionable.
5. "tags": 2-5 topic tags. Lowercase. Prefer from: [${existingTags.slice(0, 50).join(", ")}].

Return ONLY valid JSON, no markdown fences.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(extractJSON(text)) as VideoEnrichment;
}

export async function enrichTweet(
  tweetText: string,
  handle: string,
  existingTags: string[],
): Promise<TweetEnrichment> {
  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Analyze this tweet from @${handle}:

"${tweetText}"

Return a JSON object with:
1. "summary": A single clear sentence summarizing what this tweet says. If the tweet IS already one clear sentence, just clean it up slightly.
2. "action_items": An array of actionable items extracted from the tweet. Each item has "text" (a concrete thing the reader could do) and optionally "url" (a relevant URL from the tweet — e.g. a GitHub repo, tool, resource). Extract URLs mentioned in the tweet and attach them to the most relevant action item. Return an empty array [] if there's nothing actionable (e.g. news, opinions, jokes).
3. "tags": 2-5 topic tags for categorization. Use lowercase, no #. Prefer matching from this list of existing tags when relevant: [${existingTags.slice(0, 50).join(", ")}]. Add new tags only if nothing existing fits.

Return ONLY valid JSON, no markdown fences.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  return JSON.parse(extractJSON(text)) as TweetEnrichment;
}
