import SwiftUI
import SwiftData
import WebKit

struct ReaderView: View {
    @Environment(\.modelContext) private var context
    let bookmark: Bookmark
    @State private var showingSafari = false
    @State private var fetchedHTML: String?
    @State private var isFetching = false
    @State private var fetchFailed = false

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
                    Text("Loading reader view...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else if fetchFailed, let url = URL(string: bookmark.url) {
                LiveWebView(url: url)
                    .ignoresSafeArea(edges: .bottom)
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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        showingSafari = true
                    } label: {
                        Label("Open Original", systemImage: "safari")
                    }

                    if let url = URL(string: bookmark.url) {
                        ShareLink(item: url) {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                    }

                    Button {
                        UIPasteboard.general.string = bookmark.url
                    } label: {
                        Label("Copy URL", systemImage: "doc.on.doc")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showingSafari) {
            if let url = URL(string: bookmark.url) {
                SafariView(url: url)
            }
        }
    }

    private func fetchReaderContent() async {
        isFetching = true
        defer { isFetching = false }

        do {
            guard let row = try await SupabaseService.shared.fetchArchivedContent(bookmarkID: bookmark.id),
                  let html = row.content_html else {
                fetchFailed = true
                return
            }

            // Cache locally for offline use
            let cached = CachedContent(bookmarkID: bookmark.id, html: html, plainText: row.content_text)
            context.insert(cached)
            bookmark.cachedContent = cached
            try? context.save()

            fetchedHTML = html
        } catch {
            fetchFailed = true
        }
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
