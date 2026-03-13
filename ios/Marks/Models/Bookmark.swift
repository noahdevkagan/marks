import Foundation
import SwiftData

enum SyncStatus: Int, Codable {
    case synced = 0
    case pending = 1     // created locally, not yet pushed
    case modified = 2    // edited locally, not yet pushed
    case deleted = 3     // deleted locally, not yet pushed
}

@Model
final class Bookmark {
    @Attribute(.unique) var id: Int
    var url: String
    var title: String
    var desc: String
    var tags: [String]
    var type: String?
    var isRead: Bool
    var isArchived: Bool
    var createdAt: Date
    var updatedAt: Date

    // Stored as Int so SwiftData #Predicate can filter on it
    var syncStatusValue: Int

    // Relationships
    @Relationship(deleteRule: .cascade)
    var cachedContent: CachedContent?

    @Transient
    var syncStatus: SyncStatus {
        get { SyncStatus(rawValue: syncStatusValue) ?? .synced }
        set { syncStatusValue = newValue.rawValue }
    }

    init(
        id: Int,
        url: String,
        title: String,
        desc: String = "",
        tags: [String] = [],
        type: String? = nil,
        isRead: Bool = false,
        isArchived: Bool = false,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        syncStatus: SyncStatus = .synced
    ) {
        self.id = id
        self.url = url
        self.title = title
        self.desc = desc
        self.tags = tags
        self.type = type
        self.isRead = isRead
        self.isArchived = isArchived
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.syncStatusValue = syncStatus.rawValue
    }

    var hostname: String {
        guard let host = URL(string: url)?.host else { return url }
        return host.replacingOccurrences(of: "www.", with: "")
    }

    var relativeDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: createdAt, relativeTo: .now)
    }
}
