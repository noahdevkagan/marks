# Marks iOS App

Native SwiftUI app for the Marks bookmark tracker.

## Requirements

- Xcode 15+
- iOS 17+ deployment target
- Apple Developer account ($99/year) — [Enroll here](https://developer.apple.com/programs/enroll/)

## Setup

### 1. Create Xcode Project

1. Open Xcode → **File → New → Project**
2. Choose **iOS → App**
3. Product Name: **Marks**
4. Organization Identifier: `com.yourname`
5. Interface: **SwiftUI**, Language: **Swift**, Storage: **SwiftData**
6. Save into the `ios/` directory (overwrite or merge with existing files)

### 2. Add Supabase Dependency

1. In Xcode: **File → Add Package Dependencies**
2. Search: `https://github.com/supabase/supabase-swift`
3. Add the `Supabase` product to the **Marks** target

### 3. Add Existing Source Files

1. In Xcode, right-click the **Marks** group → **Add Files to "Marks"**
2. Select all files from:
   - `Marks/Models/`
   - `Marks/Services/`
   - `Marks/ViewModels/`
   - `Marks/Views/`
   - `Marks/Reader/`
   - `Marks/Config.swift`
   - `Marks/ContentView.swift`
   - `Marks/MarksApp.swift`

### 4. Configure

1. Edit `Config.swift` — set your Supabase URL and anon key
2. In **Signing & Capabilities**:
   - Add **App Groups** → `group.com.yourname.marks`
   - Add **Background Modes** → Background fetch
3. Update the bundle identifier to match your developer account

### 5. Add Share Extension

1. **File → New → Target → Share Extension**
2. Name: `ShareExtension`
3. Replace generated files with `ShareExtension/ShareViewController.swift` and `ShareExtension/Info.plist`
4. Add **App Groups** capability with the same group ID
5. Add `SupabaseService.swift` and `Config.swift` to the ShareExtension target membership

### 6. Build & Run

```sh
# Open in Xcode
open ios/Marks.xcodeproj  # or .xcworkspace if using CocoaPods
```

Build for iPhone simulator (iOS 17+).

## Architecture

```
MarksApp (entry point)
├── ContentView (TabView: Bookmarks | Tags | Settings)
├── Models/
│   ├── Bookmark.swift      — SwiftData @Model, mirrors Supabase schema
│   └── CachedContent.swift — Offline HTML/text cache
├── Services/
│   ├── SupabaseService.swift — Auth + CRUD via Supabase Swift SDK
│   └── SyncEngine.swift      — Two-way sync (server-wins conflict resolution)
├── ViewModels/
│   ├── AuthViewModel.swift        — Login/signup state
│   └── BookmarkListViewModel.swift — Filter, search, sync triggers
├── Views/
│   ├── LoginView.swift        — Email/password auth
│   ├── BookmarkListView.swift — Main list with search, filter pills, swipe actions
│   ├── BookmarkRowView.swift  — Row: favicon, title, tags, offline badge
│   ├── AddBookmarkView.swift  — Add URL form with tags
│   ├── TagsView.swift         — Browse tags with counts
│   └── SettingsView.swift     — Account, sync, library stats
├── Reader/
│   ├── ReaderView.swift   — WKWebView reader for cached HTML
│   └── ReaderStyles.swift — CSS matching web app's reader mode
└── ShareExtension/
    └── ShareViewController.swift — Save URLs from Safari/Chrome
```

## Offline Support

- Bookmarks sync to SwiftData for offline browsing
- `archived_content` (HTML) is cached locally for offline reading
- Bookmarks created offline get `syncStatus = .pending` and push on next sync
- Pull-to-refresh triggers full sync
