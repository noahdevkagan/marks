// Canonical URL form used as the bookmark dedup key.
// Conservative: strips known tracking params and trailing slashes only —
// never touches path casing, hash, or meaningful query params.

const TRACKING_PARAMS =
  /^(utm_|fbclid$|gclid$|gbraid$|wbraid$|msclkid$|mc_eid$|mc_cid$|igshid$|ref_src$|ref_url$|twclid$|vero_id$|_hsenc$|_hsmi$|oly_enc_id$|oly_anon_id$)/;

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return raw;

    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }

    // Twitter/X share links carry s= and t= tracking params
    const host = u.hostname.replace(/^www\./, "");
    if (host === "x.com" || host === "twitter.com") {
      u.searchParams.delete("s");
      u.searchParams.delete("t");
    }

    // Strip trailing slashes from the path (keep root "/")
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";

    return u.toString();
  } catch {
    return raw;
  }
}
