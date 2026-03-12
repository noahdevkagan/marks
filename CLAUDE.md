# Marks — Private Bookmark Tracker

## Tech Stack
- **Next.js 16** (App Router) + React 19 + TypeScript
- **Supabase** (Postgres + Auth + RLS)
- **CSS**: Single `globals.css` with CSS variables, dark mode via `prefers-color-scheme`

## Skills
- `/import-data` — Generate an import script for a new data source (Twitter, Chrome, Raindrop, etc.)
- `/add-api-route` — Scaffold a new API route with auth + validation
- `/test-lib` — Create a test script for a lib module
- `/deploy-stack` — Set up Supabase + Vercel + Cloudflare for deployment

## Conventions
- **API routes**: Always call `requireUser()` from `lib/auth.ts` first. Return 401 for auth errors, 400 for validation, 500 for server errors.
- **Database**: All queries go through `lib/db.ts`. Tags are global, bookmarks are per-user via RLS.
- **Tests**: Plain TypeScript scripts in `scripts/test-*.ts`, run with `npx tsx`. No test framework.
- **CSS**: All styles in `app/globals.css`. Use existing CSS variables (`--bg`, `--accent`, `--tag-bg`, etc.)
- **Components**: Server Components by default, `"use client"` only for interactive components.

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npx tsx scripts/test-suggest-tags.ts` — Run tag suggestion tests
- `npx tsx scripts/import-pinboard.ts <file> <user-id>` — Import Pinboard bookmarks
- `npx tsx scripts/import-twitter.ts <file> <user-id>` — Import Twitter archive

## iOS App (`ios/`)
- **SwiftUI + SwiftData** app targeting iOS 17+
- **Supabase** sync via REST (no Swift SDK — uses URLSession)
- **Bundle ID**: `com.marks.app` (share extension: `com.marks.app.share`)
- **App Group**: `group.com.noah.Marks` (shared UserDefaults between app + share extension)
- Config in `ios/Marks/Config.swift`

### App Store Submission Checklist
- [x] Info.plist: `ITSAppUsesNonExemptEncryption: NO`, version 1.0.0, orientations
- [x] Fastlane metadata in `ios/fastlane/metadata/en-US/` (description, keywords, subtitle, release notes)
- [x] Fastlane Appfile + Deliverfile + rating config
- [x] Fastlane lanes: `screenshots`, `beta`, `release`, `ship`
- [x] Privacy policy at `/privacy` (covers web + iOS)
- [x] Support page at `/support`
- [ ] **Fill in Apple Developer Team ID** in `ios/fastlane/Appfile`
- [ ] **Create app record** in App Store Connect (bundle ID: `com.marks.app`)
- [ ] **Create demo account** for App Review (update `ios/fastlane/Deliverfile`)
- [ ] **Take screenshots** manually, put in `ios/fastlane/screenshots/`
- [ ] **Archive + upload** from Xcode or run `fastlane beta`

### iOS Commands
- `cd ios && fastlane screenshots` — Capture App Store screenshots
- `cd ios && fastlane beta` — Build + upload to TestFlight
- `cd ios && fastlane release` — Upload metadata + screenshots only
- `cd ios && fastlane ship` — Full release (build + metadata + upload)
