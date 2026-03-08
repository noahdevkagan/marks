import SwiftUI
import WebKit

struct ReaderView: View {
    let bookmark: Bookmark
    @State private var showingSafari = false

    var body: some View {
        Group {
            if let cached = bookmark.cachedContent, let html = cached.html {
                ReaderWebView(html: wrapHTML(html, title: bookmark.title))
            } else {
                VStack(spacing: 16) {
                    Image(systemName: "doc.text")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                    Text("No cached content")
                        .font(.headline)
                    Text("Open the original page to read this bookmark.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Open Original") {
                        showingSafari = true
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding()
            }
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

// Minimal Safari in-app browser
import SafariServices

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
