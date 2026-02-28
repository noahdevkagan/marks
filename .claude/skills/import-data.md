---
name: import-data
description: Generate an import script for a new data source (Twitter, Chrome, Raindrop, etc.) following the existing Pinboard import pattern. Use when the user wants to import bookmarks from another service.
user_invocable: true
---

# Import Data Skill

Generate a new `scripts/import-*.ts` file to import bookmarks from an external service into Marks.

## Reference Pattern

Study the existing import script at `scripts/import-pinboard.ts` before generating. It demonstrates:

- Loading env from `.env.local` for Supabase credentials
- Using `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) for bulk operations
- Batch upserting bookmarks (100 per batch) with `onConflict: "user_id,url"`
- Collecting unique tags, upserting them, building a tag ID map
- Linking bookmarks to tags via the `bookmark_tags` junction table
- Progress reporting via `process.stdout.write`
- CLI usage: `npx tsx scripts/import-*.ts <file> <user-id>`

## Workflow

1. **Ask** which service to import from (if not specified)
2. **Research** the export format of that service (JSON structure, CSV columns, etc.)
3. **Create** `scripts/import-{service}.ts` following the Pinboard pattern:
   - Parse the source file format
   - Map fields to Marks schema: `url`, `title`, `description`, `tags[]`, `is_read`, `created_at`
   - Batch upsert bookmarks + tags
   - Report progress
4. **Add** an npm script to `package.json`: `"import:{service}": "tsx scripts/import-{service}.ts"`
5. **Test** with a small mock data file if possible

## Field Mapping Template

| Marks field | Required | Notes |
|-------------|----------|-------|
| `url` | Yes | The bookmark URL |
| `title` | Yes | Page title or first ~100 chars of content |
| `description` | No | Notes, tweet text, or extended description |
| `tags` | No | Extract from hashtags, labels, folders, categories |
| `is_read` | No | Default `true` unless source has "read later" concept |
| `created_at` | No | Preserve original timestamp if available |

## Known Export Formats

### Twitter/X Archive
- File: `data/bookmark.js` (starts with `window.YTD.bookmark.part0 = [...]`)
- Contains only `tweetId` — need Twitter API v2 to resolve content
- API: `GET /2/tweets?ids=...&tweet.fields=text,created_at,entities`
- Tags: extract from `entities.hashtags`

### Chrome Bookmarks
- File: `Bookmarks` (JSON with nested folders)
- Fields: `url`, `name`, `date_added` (Chrome epoch: microseconds since 1601-01-01)
- Tags: derive from folder names

### Raindrop.io
- Export as CSV or JSON
- Fields: `link`, `title`, `excerpt`, `tags`, `created`, `folder`
