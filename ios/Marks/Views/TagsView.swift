import SwiftUI
import SwiftData

struct TagsView: View {
    @Query(filter: #Predicate<Bookmark> { $0.syncStatusValue != 3 })
    private var bookmarks: [Bookmark]

    @State private var selectedTag: String?

    private var tagCounts: [(tag: String, count: Int)] {
        var counts: [String: Int] = [:]
        for bookmark in bookmarks {
            for tag in bookmark.tags {
                counts[tag, default: 0] += 1
            }
        }
        return counts.map { (tag: $0.key, count: $0.value) }
            .sorted { $0.count > $1.count }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(tagCounts, id: \.tag) { item in
                    NavigationLink(value: item.tag) {
                        HStack {
                            Text(item.tag)
                                .font(.body)
                            Spacer()
                            Text("\(item.count)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .navigationTitle("Tags")
            .navigationDestination(for: String.self) { tag in
                TagBookmarksView(tag: tag)
            }
            .overlay {
                if tagCounts.isEmpty {
                    ContentUnavailableView(
                        "No Tags",
                        systemImage: "tag",
                        description: Text("Tags will appear once you tag your bookmarks.")
                    )
                }
            }
        }
    }
}

struct TagBookmarksView: View {
    let tag: String

    @Query private var bookmarks: [Bookmark]

    init(tag: String) {
        self.tag = tag
        // Note: SwiftData Predicate can't check array contains, so we filter in body
        _bookmarks = Query(
            filter: #Predicate<Bookmark> { $0.syncStatusValue != 3 },
            sort: \Bookmark.createdAt,
            order: .reverse
        )
    }

    private var filtered: [Bookmark] {
        bookmarks.filter { $0.tags.contains(tag) }
    }

    var body: some View {
        List(filtered) { bookmark in
            NavigationLink(value: bookmark) {
                BookmarkRowView(bookmark: bookmark)
            }
        }
        .listStyle(.plain)
        .navigationTitle("#\(tag)")
        .navigationDestination(for: Bookmark.self) { bookmark in
            ReaderView(bookmark: bookmark)
        }
    }
}
