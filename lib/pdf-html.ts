/** Escape HTML entities in plain text */
function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Join PDF lines into flowing text, handling word hyphenation at line breaks */
function joinLines(lines: string[]): string {
  if (lines.length === 0) return "";
  let result = lines[0];
  for (let i = 1; i < lines.length; i++) {
    // Word hyphenated across lines: "competi-\ntive" → "competitive"
    if (result.endsWith("-") && /^[a-z]/.test(lines[i])) {
      result = result.slice(0, -1) + lines[i];
    } else {
      result += " " + lines[i];
    }
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

/** Detect if a short block of text looks like a section heading */
function isHeading(text: string, lineCount: number): boolean {
  if (text.length > 120 || lineCount > 2) return false;
  if (/[.!?:,;]$/.test(text)) return false;
  if (text === text.toUpperCase() && /[A-Z]{2}/.test(text)) return true;
  if (/^\d+(\.\d+)*\.?\s+\S/.test(text) && text.length < 80) return true;
  if (/^[IVXLC]+\.\s+\S/.test(text) && text.length < 80) return true;
  if (/^[A-Z]\.\s+\S/.test(text) && text.length < 60) return true;
  return false;
}

const BULLET_RE = /^[•▪▸►●◦‣⁃∙○■□–—]\s/;
const HYPHEN_BULLET_RE = /^-\s+\S/;
const NUMBERED_ITEM_RE = /^\d+[\.\)]\s/;

/** Convert extracted PDF plain text into structured HTML */
export function textToHtml(text: string): string {
  const cleaned = text.replace(/\f/g, "\n\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = cleaned.split(/\n\s*\n/);
  const html: string[] = [];

  for (const rawBlock of blocks) {
    const lines = rawBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    // Skip standalone page numbers
    if (lines.length === 1 && /^\d{1,4}$/.test(lines[0])) continue;

    // Detect bullet list (all lines start with bullet characters)
    const allBullets =
      lines.length > 1 &&
      lines.every((l) => BULLET_RE.test(l) || HYPHEN_BULLET_RE.test(l));
    if (allBullets) {
      const items = lines.map(
        (l) =>
          `<li>${esc(l.replace(/^[•▪▸►●◦‣⁃∙○■□–—-]\s*/, ""))}</li>`,
      );
      html.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    // Detect numbered list (all lines start with "1." / "2)" etc.)
    const allNumbered =
      lines.length > 1 && lines.every((l) => NUMBERED_ITEM_RE.test(l));
    if (allNumbered) {
      const items = lines.map(
        (l) => `<li>${esc(l.replace(/^\d+[\.\)]\s*/, ""))}</li>`,
      );
      html.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }

    // Mixed: intro paragraph followed by bullet items
    const firstBulletIdx = lines.findIndex(
      (l) => BULLET_RE.test(l) || HYPHEN_BULLET_RE.test(l),
    );
    if (
      firstBulletIdx > 0 &&
      lines
        .slice(firstBulletIdx)
        .every((l) => BULLET_RE.test(l) || HYPHEN_BULLET_RE.test(l))
    ) {
      const intro = joinLines(lines.slice(0, firstBulletIdx));
      const items = lines.slice(firstBulletIdx).map(
        (l) =>
          `<li>${esc(l.replace(/^[•▪▸►●◦‣⁃∙○■□–—-]\s*/, ""))}</li>`,
      );
      html.push(`<p>${esc(intro)}</p>\n<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    // Join lines into flowing text (removes arbitrary PDF line breaks)
    const joined = joinLines(lines);
    if (!joined) continue;

    // Heading detection
    if (isHeading(joined, lines.length)) {
      const tag =
        joined === joined.toUpperCase() && /[A-Z]{2}/.test(joined)
          ? "h2"
          : "h3";
      html.push(`<${tag}>${esc(joined)}</${tag}>`);
      continue;
    }

    // Figure / table captions
    if (
      /^(?:Figure|Fig\.|Table|Chart|Exhibit)\s+\d/i.test(joined) &&
      joined.length < 300
    ) {
      html.push(`<p><em>${esc(joined)}</em></p>`);
      continue;
    }

    // Regular paragraph — lines joined with spaces, not <br>
    html.push(`<p>${esc(joined)}</p>`);
  }

  return html.join("\n");
}
