import Foundation
import SwiftData

@MainActor
final class BookmarkListViewModel: ObservableObject {
    @Published var searchText = ""
    @Published var isSyncing = false
    @Published var syncError: String?
    @Published var filter: BookmarkFilter = .all

    enum BookmarkFilter: String, CaseIterable {
        case all = "All"
        case unread = "Unread"
        case archived = "Archived"
    }

    private let syncEngine = SyncEngine()

    func sync(context: ModelContext) async {
        isSyncing = true
        syncError = nil
        do {
            try await syncEngine.sync(context: context)
        } catch {
            syncError = error.localizedDescription
        }
        isSyncing = false
    }

    func deleteBookmark(_ bookmark: Bookmark, context: ModelContext) {
        if bookmark.syncStatus == .pending {
            // Never synced, just remove locally
            context.delete(bookmark)
        } else {
            bookmark.syncStatus = .deleted
        }
        try? context.save()
    }

    func toggleRead(_ bookmark: Bookmark, context: ModelContext) {
        bookmark.isRead.toggle()
        if bookmark.syncStatus == .synced {
            bookmark.syncStatus = .modified
        }
        try? context.save()
    }

    func toggleArchive(_ bookmark: Bookmark, context: ModelContext) {
        bookmark.isArchived.toggle()
        if bookmark.syncStatus == .synced {
            bookmark.syncStatus = .modified
        }
        try? context.save()
    }

    func predicate() -> Predicate<Bookmark> {
        let search = searchText.lowercased()
        let filterValue = filter

        switch filterValue {
        case .all:
            if search.isEmpty {
                return #Predicate { $0.syncStatus.rawValue != 3 }
            }
            return #Predicate { bookmark in
                bookmark.syncStatus.rawValue != 3 &&
                (bookmark.title.localizedStandardContains(search) ||
                 bookmark.url.localizedStandardContains(search))
            }
        case .unread:
            if search.isEmpty {
                return #Predicate { $0.syncStatus.rawValue != 3 && !$0.isRead }
            }
            return #Predicate { bookmark in
                bookmark.syncStatus.rawValue != 3 && !bookmark.isRead &&
                (bookmark.title.localizedStandardContains(search) ||
                 bookmark.url.localizedStandardContains(search))
            }
        case .archived:
            if search.isEmpty {
                return #Predicate { $0.syncStatus.rawValue != 3 && $0.isArchived }
            }
            return #Predicate { bookmark in
                bookmark.syncStatus.rawValue != 3 && bookmark.isArchived &&
                (bookmark.title.localizedStandardContains(search) ||
                 bookmark.url.localizedStandardContains(search))
            }
        }
    }
}
