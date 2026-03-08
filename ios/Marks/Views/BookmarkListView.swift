import SwiftUI
import SwiftData

struct BookmarkListView: View {
    @Environment(\.modelContext) private var context
    @StateObject private var vm = BookmarkListViewModel()
    @State private var showingAdd = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter pills
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(BookmarkListViewModel.BookmarkFilter.allCases, id: \.self) { filter in
                            Button {
                                vm.filter = filter
                            } label: {
                                Text(filter.rawValue)
                                    .font(.subheadline.weight(.medium))
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                    .background(
                                        vm.filter == filter
                                            ? Color.accentColor.opacity(0.15)
                                            : Color(.systemGray6)
                                    )
                                    .foregroundStyle(
                                        vm.filter == filter ? .accent : .secondary
                                    )
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }

                BookmarkQueryView(predicate: vm.predicate(), vm: vm)
            }
            .navigationTitle("Marks")
            .searchable(text: $vm.searchText, prompt: "Search bookmarks...")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAdd) {
                AddBookmarkView()
            }
            .refreshable {
                await vm.sync(context: context)
            }
            .task {
                await vm.sync(context: context)
            }
        }
    }
}

// Separate view to use @Query with dynamic predicate
struct BookmarkQueryView: View {
    @Environment(\.modelContext) private var context
    @Query private var bookmarks: [Bookmark]
    @ObservedObject var vm: BookmarkListViewModel

    init(predicate: Predicate<Bookmark>, vm: BookmarkListViewModel) {
        self.vm = vm
        _bookmarks = Query(
            filter: predicate,
            sort: \Bookmark.createdAt,
            order: .reverse
        )
    }

    var body: some View {
        List {
            ForEach(bookmarks) { bookmark in
                NavigationLink(value: bookmark) {
                    BookmarkRowView(bookmark: bookmark)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        vm.deleteBookmark(bookmark, context: context)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }

                    Button {
                        vm.toggleArchive(bookmark, context: context)
                    } label: {
                        Label(
                            bookmark.isArchived ? "Unarchive" : "Archive",
                            systemImage: bookmark.isArchived ? "tray.and.arrow.up" : "archivebox"
                        )
                    }
                    .tint(.orange)
                }
                .swipeActions(edge: .leading) {
                    Button {
                        vm.toggleRead(bookmark, context: context)
                    } label: {
                        Label(
                            bookmark.isRead ? "Mark Unread" : "Mark Read",
                            systemImage: bookmark.isRead ? "circle" : "checkmark.circle"
                        )
                    }
                    .tint(.green)
                }
            }
        }
        .listStyle(.plain)
        .navigationDestination(for: Bookmark.self) { bookmark in
            ReaderView(bookmark: bookmark)
        }
        .overlay {
            if bookmarks.isEmpty {
                ContentUnavailableView(
                    "No Bookmarks",
                    systemImage: "bookmark",
                    description: Text("Pull to refresh or tap + to add one.")
                )
            }
        }
    }
}
