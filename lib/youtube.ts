import { YoutubeTranscript } from "youtube-transcript";

export type TranscriptSegment = {
  text: string;
  offset: number; // seconds
  duration: number;
};

export type YouTubeTranscriptResult = {
  text: string;
  segments: TranscriptSegment[];
};

export type YouTubeMetadata = {
  title: string;
  author_name: string;
  thumbnail_url: string;
};

/** Extract YouTube video ID from any YouTube URL format */
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace("www.", "");
    if (hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      // /watch?v=ID, /embed/ID, /v/ID, /shorts/ID
      if (u.searchParams.has("v")) return u.searchParams.get("v");
      const match = u.pathname.match(/\/(embed|v|shorts)\/([^/?]+)/);
      if (match) return match[2];
    }
    return null;
  } catch {
    return null;
  }
}

/** Fetch transcript (captions) for a YouTube video */
export async function fetchYouTubeTranscript(
  videoId: string,
): Promise<YouTubeTranscriptResult | null> {
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    if (!items || items.length === 0) return null;

    const segments: TranscriptSegment[] = items.map((item) => ({
      text: item.text,
      offset: Math.round(item.offset / 1000), // ms to seconds
      duration: Math.round(item.duration / 1000),
    }));

    const text = segments.map((s) => s.text).join(" ");

    return { text, segments };
  } catch {
    return null;
  }
}

/** Fetch video metadata via YouTube oEmbed (no API key needed) */
export async function fetchYouTubeMetadata(
  url: string,
): Promise<YouTubeMetadata | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title ?? "",
      author_name: data.author_name ?? "",
      thumbnail_url: data.thumbnail_url ?? "",
    };
  } catch {
    return null;
  }
}

/** Format seconds to M:SS or H:MM:SS timestamp */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Find the approximate timestamp for a quote in transcript segments */
export function findQuoteTimestamp(
  quote: string,
  segments: TranscriptSegment[],
): number | null {
  const quoteLower = quote.toLowerCase().slice(0, 60); // match on first 60 chars
  let accumulated = "";
  for (const seg of segments) {
    const prevLen = accumulated.length;
    accumulated += " " + seg.text.toLowerCase();
    if (accumulated.includes(quoteLower)) {
      return seg.offset;
    }
    // Also check if quote starts in this segment region
    if (prevLen > 0 && quoteLower.startsWith(seg.text.toLowerCase().slice(0, 20))) {
      return seg.offset;
    }
  }
  return null;
}
