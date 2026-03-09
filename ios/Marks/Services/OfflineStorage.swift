import Foundation
import SwiftData

@MainActor
final class OfflineStorage {
    static let shared = OfflineStorage()

    private init() {}

    /// Cache a bookmark's content for offline reading
    func cacheContent(for bookmark: Bookmark, html: String, plainText: String?, context: ModelContext) {
        if let existing = bookmark.cachedContent {
            existing.html = html
            existing.plainText = plainText
            existing.cachedAt = .now
        } else {
            let content = CachedContent(bookmarkID: bookmark.id, html: html, plainText: plainText)
            context.insert(content)
            bookmark.cachedContent = content
        }
        try? context.save()
    }

    /// Remove cached content for a bookmark
    func removeCachedContent(for bookmark: Bookmark, context: ModelContext) {
        if let cached = bookmark.cachedContent {
            context.delete(cached)
            bookmark.cachedContent = nil
            try? context.save()
        }
    }

    /// Check if a bookmark has cached content
    func isCached(_ bookmark: Bookmark) -> Bool {
        bookmark.cachedContent != nil
    }
}
