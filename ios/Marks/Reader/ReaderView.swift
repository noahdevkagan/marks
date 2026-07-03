import SwiftUI
import SwiftData
import WebKit

struct ReaderView: View {
    @Environment(\.modelContext) private var context
    let bookmark: Bookmark
    @State private var showingSafari = false
    @State private var showingTagEditor = false
    @State private var fetchedHTML: String?
    @State private var isFetching = false
    @State private var fetchFailed = false
    @State private var loadingMessage = "Loading reader view..."

    private var readerHTML: String? {
        bookmark.cachedContent?.html ?? fetchedHTML
    }

    var body: some View {
        Group {
            if let html = readerHTML {
                ReaderWebView(html: wrapHTML(html, title: bookmark.title))
                    .ignoresSafeArea(edges: .bottom)
            } else if isFetching {
                VStack(spacing: 16) {
                    ProgressView()
                    Text(loadingMessage)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else if fetchFailed, let url = URL(string: bookmark.url) {
                LiveWebView(url: url)
                    .ignoresSafeArea(edges: .bottom)
                    .safeAreaInset(edge: .top) {
                        Text("Reader unavailable · showing original page")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 5)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(.top, 4)
                    }
            } else {
                VStack(spacing: 16) {
                    Image(systemName: "doc.text")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                    Text("Unable to load content")
                        .font(.headline)
                    Button("Open in Safari") {
                        showingSafari = true
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding()
            }
        }
        .task {
            guard readerHTML == nil else { return }
            await fetchReaderContent()
        }
        .navigationTitle(bookmark.hostname)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        showingSafari = true
                    } label: {
                        Label("Open Original", systemImage: "safari")
                    }

                    Button {
                        UIPasteboard.general.string = bookmark.url
                    } label: {
                        Label("Copy URL", systemImage: "doc.on.doc")
                    }

                    Button {
                        toggleArchived()
                    } label: {
                        Label(
                            bookmark.isArchived ? "Unarchive" : "Archive",
                            systemImage: bookmark.isArchived ? "tray.and.arrow.up" : "archivebox"
                        )
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }

            ToolbarItemGroup(placement: .bottomBar) {
                Button {
                    toggleFinished()
                } label: {
                    Label(
                        bookmark.isRead ? "Finished" : "Mark Finished",
                        systemImage: bookmark.isRead ? "checkmark.circle.fill" : "checkmark.circle"
                    )
                }

                Spacer()

                Button {
                    showingTagEditor = true
                } label: {
                    Label("Tags", systemImage: bookmark.tags.isEmpty ? "tag" : "tag.fill")
                }

                Spacer()

                if let url = URL(string: bookmark.url) {
                    ShareLink(item: url) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                }
            }
        }
        .sheet(isPresented: $showingSafari) {
            if let url = URL(string: bookmark.url) {
                SafariView(url: url)
            }
        }
        .sheet(isPresented: $showingTagEditor) {
            ReaderTagEditor(bookmark: bookmark)
        }
    }

    private func toggleFinished() {
        bookmark.isRead.toggle()
        if bookmark.syncStatus == .synced {
            bookmark.syncStatus = .modified
        }
        try? context.save()
    }

    private func toggleArchived() {
        bookmark.isArchived.toggle()
        if bookmark.syncStatus == .synced {
            bookmark.syncStatus = .modified
        }
        try? context.save()
    }

    private func fetchReaderContent() async {
        // During UI tests, skip the network call — seeded bookmarks with
        // cachedContent will already have readerHTML populated.
        guard !UITestSeeder.isUITest else {
            fetchFailed = true
            return
        }

        isFetching = true
        defer { isFetching = false }

        do {
            // 1. Content already archived on the server
            if try await loadArchivedContent() { return }

            // 2. Nothing archived yet (common for bookmarks saved from iOS) —
            // ask the server to extract the article now, then pull the result.
            loadingMessage = "Extracting article..."
            if try await SupabaseService.shared.triggerArchive(bookmarkID: bookmark.id),
               try await loadArchivedContent() {
                return
            }

            fetchFailed = true
        } catch {
            fetchFailed = true
        }
    }

    /// Pull archived content from the server and cache it locally.
    /// Returns false when the server has no archive for this bookmark.
    private func loadArchivedContent() async throws -> Bool {
        guard let row = try await SupabaseService.shared.fetchArchivedContent(bookmarkID: bookmark.id),
              let html = row.content_html else {
            return false
        }

        let cached = CachedContent(bookmarkID: bookmark.id, html: html, plainText: row.content_text)
        context.insert(cached)
        bookmark.cachedContent = cached
        try? context.save()

        fetchedHTML = html
        return true
    }

    private func wrapHTML(_ content: String, title: String) -> String {
        """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <style>\(ReaderStyles.css)</style>
        </head>
        <body>
        <h1>\(title.replacingOccurrences(of: "<", with: "&lt;"))</h1>
        <div class="meta">\(bookmark.hostname)</div>
        \(content)
        </body>
        </html>
        """
    }
}

// Bottom-sheet tag editor for the reader's "Tags" action
struct ReaderTagEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    let bookmark: Bookmark
    @State private var tags: [String] = []
    @State private var tagInput = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Tags") {
                    if !tags.isEmpty {
                        FlowLayout(spacing: 6) {
                            ForEach(tags, id: \.self) { tag in
                                HStack(spacing: 4) {
                                    Text(tag)
                                    Button {
                                        if let i = tags.firstIndex(of: tag) {
                                            tags.remove(at: i)
                                        }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.caption)
                                    }
                                    .buttonStyle(.plain)
                                }
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color(.systemGray6))
                                .clipShape(Capsule())
                            }
                        }
                    }

                    HStack {
                        TextField("Add tag...", text: $tagInput)
                            .textInputAutocapitalization(.never)
                            .onSubmit { addTag() }
                        Button("Add") { addTag() }
                            .disabled(tagInput.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .navigationTitle("Tags")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { tags = bookmark.tags }
    }

    private func addTag() {
        let t = tagInput.trimmingCharacters(in: .whitespaces).lowercased()
        if !t.isEmpty, !tags.contains(t) {
            tags.append(t)
        }
        tagInput = ""
    }

    private func save() {
        // Pending bookmarks still have a temp local ID — their tags go up
        // with the initial create, so skip the immediate server push.
        let canPushNow = bookmark.syncStatus != .pending

        bookmark.tags = tags
        if bookmark.syncStatus == .synced {
            bookmark.syncStatus = .modified
        }
        try? context.save()

        if canPushNow {
            let id = bookmark.id
            let newTags = tags
            Task {
                try? await SupabaseService.shared.replaceBookmarkTags(bookmarkID: id, tags: newTags)
            }
        }
        dismiss()
    }
}

struct ReaderWebView: UIViewRepresentable {
    let html: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.loadHTMLString(html, baseURL: nil)
    }
}

struct LiveWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        webView.allowsBackForwardNavigationGestures = true
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url == nil {
            webView.load(URLRequest(url: url))
        }
    }
}

// Minimal Safari in-app browser
import SafariServices

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
