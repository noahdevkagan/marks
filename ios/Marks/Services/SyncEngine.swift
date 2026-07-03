import Foundation
import SwiftData

@MainActor
final class SyncEngine {
    private let supabase = SupabaseService.shared
    private static let dateParserFixAppliedKey = "syncDateParserFixApplied"

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        return formatter
    }()

    private static let fractionalISOFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private func parseSupabaseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        return Self.fractionalISOFormatter.date(from: value) ?? Self.isoFormatter.date(from: value)
    }

    func sync(context: ModelContext) async throws {
        // 1. Import bookmarks saved via the share extension (always works, no auth needed)
        await importShareExtensionQueue(context: context)

        // 2. Only sync with server if signed in
        guard await supabase.currentUser != nil else {
            try context.save()
            return
        }

        // 3. Push local pending changes. A push failure shouldn't block the pull —
        // hold the error, pull, then surface it.
        var pushError: Error?
        do {
            try await pushPending(context: context)
        } catch {
            pushError = error
        }

        // 4. Pull remote changes
        try await pullRemote(context: context)

        try context.save()

        if let pushError { throw pushError }
    }

    /// Import bookmarks queued by the share extension via shared UserDefaults.
    private func importShareExtensionQueue(context: ModelContext) async {
        let defaults = UserDefaults(suiteName: Config.appGroupID)
        guard let queue = defaults?.array(forKey: "pendingBookmarks") as? [[String: String]],
              !queue.isEmpty else { return }

        // The share extension rarely gets a title from the share sheet, and the
        // server-side fallback is bot-blocked by many sites. Resolve titles here,
        // on the phone's own connection, before inserting.
        let fetchedTitles: [String?] = await withTaskGroup(of: (Int, String?).self) { group in
            for (index, entry) in queue.enumerated() {
                guard let url = entry["url"] else { continue }
                let queuedTitle = entry["title"] ?? ""
                if PageTitleFetcher.needsTitle(queuedTitle, url: url) {
                    group.addTask { (index, await PageTitleFetcher.title(for: url)) }
                }
            }
            var titles = [String?](repeating: nil, count: queue.count)
            for await (index, title) in group {
                titles[index] = title
            }
            return titles
        }

        for (index, entry) in queue.enumerated() {
            guard let url = entry["url"] else { continue }
            let title = fetchedTitles[index] ?? entry["title"] ?? ""
            let bookmark = Bookmark(
                id: Int.random(in: 100_000...999_999),
                url: url,
                title: title,
                syncStatus: .pending
            )
            context.insert(bookmark)
        }

        // Clear the queue after importing
        defaults?.removeObject(forKey: "pendingBookmarks")
    }

    // MARK: — Push local → remote

    private func pushPending(context: ModelContext) async throws {
        let pendingDescriptor = FetchDescriptor<Bookmark>(
            predicate: #Predicate { $0.syncStatusValue != 0 }
        )
        let pending = try context.fetch(pendingDescriptor)

        // One failing bookmark (unreachable URL, transient 5xx) must not strand
        // the rest of the queue — push everything, then surface the first error.
        var firstError: Error?

        for bookmark in pending {
            do {
                switch bookmark.syncStatus {
                case .pending:
                    let insert = SupabaseService.BookmarkInsert(
                        url: bookmark.url,
                        title: bookmark.title,
                        description: bookmark.desc,
                        tags: bookmark.tags
                    )
                    // Use web API which extracts page title when missing
                    let response = try await supabase.createBookmarkViaWebAPI(insert)
                    bookmark.id = response.id
                    if !response.title.isEmpty {
                        bookmark.title = response.title
                    }
                    bookmark.syncStatus = .synced

                case .deleted:
                    try await supabase.deleteBookmark(id: bookmark.id)
                    context.delete(bookmark)

                case .modified:
                    let update = SupabaseService.BookmarkUpdate(
                        title: bookmark.title,
                        description: bookmark.desc,
                        is_read: bookmark.isRead,
                        is_archived: bookmark.isArchived
                    )
                    try await supabase.updateBookmark(id: bookmark.id, update)
                    try await supabase.replaceBookmarkTags(bookmarkID: bookmark.id, tags: bookmark.tags)
                    bookmark.syncStatus = .synced

                case .synced:
                    break
                }
            } catch {
                if firstError == nil { firstError = error }
            }
        }

        if let firstError { throw firstError }
    }

    // MARK: — Pull remote → local

    private func pullRemote(context: ModelContext) async throws {
        let dateParserFixApplied = UserDefaults.standard.bool(forKey: Self.dateParserFixAppliedKey)
        let lastSync = dateParserFixApplied ? UserDefaults.standard.object(forKey: "lastSyncDate") as? Date : nil
        let rows = try await supabase.fetchBookmarks(since: lastSync)

        for row in rows {
            let rowID = row.id
            let descriptor = FetchDescriptor<Bookmark>(
                predicate: #Predicate { $0.id == rowID }
            )
            let existing = try context.fetch(descriptor).first

            if let existing {
                // Server wins — update local
                existing.url = row.url
                existing.title = row.title
                existing.desc = row.description ?? ""
                existing.tags = row.tags
                existing.type = row.type
                existing.isRead = row.is_read ?? false
                existing.isArchived = row.is_archived ?? false
                existing.createdAt = parseSupabaseDate(row.created_at) ?? existing.createdAt
                existing.updatedAt = parseSupabaseDate(row.updated_at) ?? existing.updatedAt

                // Cache content if available
                if let html = row.content_html {
                    if let cached = existing.cachedContent {
                        cached.html = html
                        cached.plainText = row.content_text
                        cached.cachedAt = .now
                    } else {
                        let content = CachedContent(bookmarkID: row.id, html: html, plainText: row.content_text)
                        context.insert(content)
                        existing.cachedContent = content
                    }
                }
            } else {
                // New bookmark from server
                let bookmark = Bookmark(
                    id: row.id,
                    url: row.url,
                    title: row.title,
                    desc: row.description ?? "",
                    tags: row.tags,
                    type: row.type,
                    isRead: row.is_read ?? false,
                    isArchived: row.is_archived ?? false,
                    createdAt: parseSupabaseDate(row.created_at) ?? .now,
                    updatedAt: parseSupabaseDate(row.updated_at) ?? .now
                )
                context.insert(bookmark)

                // Cache content
                if let html = row.content_html {
                    let content = CachedContent(bookmarkID: row.id, html: html, plainText: row.content_text)
                    context.insert(content)
                    bookmark.cachedContent = content
                }
            }
        }

        UserDefaults.standard.set(Date.now, forKey: "lastSyncDate")
        UserDefaults.standard.set(true, forKey: Self.dateParserFixAppliedKey)
    }
}
