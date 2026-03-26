import Foundation
import SwiftData

@MainActor
final class SyncEngine {
    private let supabase = SupabaseService.shared

    func sync(context: ModelContext) async throws {
        // 1. Import bookmarks saved via the share extension (always works, no auth needed)
        importShareExtensionQueue(context: context)

        // 2. Only sync with server if signed in
        guard await supabase.currentUser != nil else {
            try context.save()
            return
        }

        // 3. Push local pending changes
        try await pushPending(context: context)

        // 4. Pull remote changes
        try await pullRemote(context: context)

        try context.save()
    }

    /// Import bookmarks queued by the share extension via shared UserDefaults.
    private func importShareExtensionQueue(context: ModelContext) {
        let defaults = UserDefaults(suiteName: Config.appGroupID)
        guard let queue = defaults?.array(forKey: "pendingBookmarks") as? [[String: String]],
              !queue.isEmpty else { return }

        for entry in queue {
            guard let url = entry["url"] else { continue }
            let title = entry["title"] ?? url
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

        for bookmark in pending {
            switch bookmark.syncStatus {
            case .pending:
                let insert = SupabaseService.BookmarkInsert(
                    url: bookmark.url,
                    title: bookmark.title,
                    description: bookmark.desc,
                    tags: bookmark.tags
                )
                let row = try await supabase.createBookmark(insert)
                bookmark.id = row.id
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
                bookmark.syncStatus = .synced

            case .synced:
                break
            }
        }
    }

    // MARK: — Pull remote → local

    private func pullRemote(context: ModelContext) async throws {
        let lastSync = UserDefaults.standard.object(forKey: "lastSyncDate") as? Date
        let rows = try await supabase.fetchBookmarks(since: lastSync)

        let iso = ISO8601DateFormatter()

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
                if let updated = row.updated_at { existing.updatedAt = iso.date(from: updated) ?? .now }

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
                    createdAt: iso.date(from: row.created_at) ?? .now,
                    updatedAt: row.updated_at.flatMap { iso.date(from: $0) } ?? .now
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
    }
}
