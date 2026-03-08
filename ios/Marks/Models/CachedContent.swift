import Foundation
import SwiftData

@Model
final class CachedContent {
    @Attribute(.unique) var bookmarkID: Int
    var html: String?
    var plainText: String?
    var cachedAt: Date

    @Relationship(inverse: \Bookmark.cachedContent)
    var bookmark: Bookmark?

    init(bookmarkID: Int, html: String? = nil, plainText: String? = nil) {
        self.bookmarkID = bookmarkID
        self.html = html
        self.plainText = plainText
        self.cachedAt = .now
    }
}
