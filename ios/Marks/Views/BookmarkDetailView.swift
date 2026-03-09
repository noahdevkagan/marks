import SwiftUI
import SwiftData

struct BookmarkDetailView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.openURL) private var openURL
    let bookmark: Bookmark

    var body: some View {
        List {
            // Header
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(bookmark.title.isEmpty ? bookmark.url : bookmark.title)
                        .font(.headline)

                    Link(bookmark.hostname, destination: URL(string: bookmark.url) ?? URL(string: "about:blank")!)
                        .font(.subheadline)
                        .foregroundStyle(.accent)

                    if !bookmark.desc.isEmpty {
                        Text(bookmark.desc)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    HStack(spacing: 12) {
                        Label(bookmark.relativeDate, systemImage: "clock")
                        if let type = bookmark.type {
                            Label(type, systemImage: "doc")
                        }
                        if bookmark.isRead {
                            Label("Read", systemImage: "checkmark.circle")
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }

            // Tags
            if !bookmark.tags.isEmpty {
                Section("Tags") {
                    FlowLayout(spacing: 6) {
                        ForEach(bookmark.tags, id: \.self) { tag in
                            Text(tag)
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color(.systemGray6))
                                .clipShape(Capsule())
                        }
                    }
                }
            }

            // Actions
            Section {
                Button {
                    if let url = URL(string: bookmark.url) {
                        openURL(url)
                    }
                } label: {
                    Label("Open in Browser", systemImage: "safari")
                }

                Button {
                    bookmark.isRead.toggle()
                    bookmark.syncStatus = .modified
                    try? context.save()
                } label: {
                    Label(
                        bookmark.isRead ? "Mark as Unread" : "Mark as Read",
                        systemImage: bookmark.isRead ? "circle" : "checkmark.circle"
                    )
                }

                Button {
                    bookmark.isArchived.toggle()
                    bookmark.syncStatus = .modified
                    try? context.save()
                } label: {
                    Label(
                        bookmark.isArchived ? "Unarchive" : "Archive",
                        systemImage: bookmark.isArchived ? "tray.and.arrow.up" : "archivebox"
                    )
                }
            }

            // Offline
            if bookmark.cachedContent != nil {
                Section {
                    Label("Available Offline", systemImage: "arrow.down.circle.fill")
                        .foregroundStyle(.green)
                }
            }
        }
        .navigationTitle("Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}
