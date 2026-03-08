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
