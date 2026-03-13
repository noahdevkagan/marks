import UIKit
import Social
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        handleSharedURL()
    }

    private func handleSharedURL() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            close()
            return
        }

        for item in items {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] data, _ in
                        guard let url = data as? URL else {
                            self?.close()
                            return
                        }
                        Task { @MainActor in
                            await self?.saveBookmark(url: url.absoluteString, title: item.attributedContentText?.string ?? "")
                        }
                    }
                    return
                }

                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] data, _ in
                        guard let text = data as? String,
                              text.hasPrefix("http") else {
                            self?.close()
                            return
                        }
                        Task { @MainActor in
                            await self?.saveBookmark(url: text, title: "")
                        }
                    }
                    return
                }
            }
        }

        close()
    }

    @MainActor
    private func saveBookmark(url: String, title: String) async {
        // Save to shared UserDefaults for the main app to sync to Supabase
        let defaults = UserDefaults(suiteName: Config.appGroupID)
        var queue = defaults?.array(forKey: "pendingBookmarks") as? [[String: String]] ?? []
        queue.append(["url": url, "title": title.isEmpty ? url : title])
        defaults?.set(queue, forKey: "pendingBookmarks")
        showSuccess()
    }

    private func showSuccess() {
        let alert = UIAlertController(title: "Saved to Marks", message: nil, preferredStyle: .alert)
        present(alert, animated: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            alert.dismiss(animated: true) {
                self?.close()
            }
        }
    }

    private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
