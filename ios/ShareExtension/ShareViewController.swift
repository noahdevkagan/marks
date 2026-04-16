import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private let cardView = UIView()
    private let iconLabel = UILabel()
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)
    private var didSave = false

    override func viewDidLoad() {
        super.viewDidLoad()

        // Use an opaque dimmed background (not .clear) — reliably
        // overrides whatever iOS puts behind the extension.
        view.backgroundColor = UIColor.black.withAlphaComponent(0.5)

        setupCard()
        handleSharedURL()

        // Safety timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
            self?.close()
        }
    }

    // MARK: - UI

    private func setupCard() {
        cardView.backgroundColor = UIColor.systemBackground
        cardView.layer.cornerRadius = 20
        cardView.layer.shadowColor = UIColor.black.cgColor
        cardView.layer.shadowOpacity = 0.25
        cardView.layer.shadowRadius = 16
        cardView.layer.shadowOffset = CGSize(width: 0, height: 6)
        cardView.translatesAutoresizingMaskIntoConstraints = false

        iconLabel.text = "\u{1F516}"  // 🔖 bookmark
        iconLabel.font = .systemFont(ofSize: 44)
        iconLabel.textAlignment = .center
        iconLabel.translatesAutoresizingMaskIntoConstraints = false

        titleLabel.text = "Saving to Marks"
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textColor = .label
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        subtitleLabel.text = ""
        subtitleLabel.font = .systemFont(ofSize: 13)
        subtitleLabel.textColor = .secondaryLabel
        subtitleLabel.textAlignment = .center
        subtitleLabel.numberOfLines = 2
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false

        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()

        cardView.addSubview(iconLabel)
        cardView.addSubview(titleLabel)
        cardView.addSubview(subtitleLabel)
        cardView.addSubview(spinner)
        view.addSubview(cardView)

        NSLayoutConstraint.activate([
            cardView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            cardView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            cardView.widthAnchor.constraint(equalToConstant: 260),

            iconLabel.topAnchor.constraint(equalTo: cardView.topAnchor, constant: 28),
            iconLabel.centerXAnchor.constraint(equalTo: cardView.centerXAnchor),

            titleLabel.topAnchor.constraint(equalTo: iconLabel.bottomAnchor, constant: 12),
            titleLabel.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -16),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 6),
            subtitleLabel.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 16),
            subtitleLabel.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -16),

            spinner.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 16),
            spinner.centerXAnchor.constraint(equalTo: cardView.centerXAnchor),
            spinner.bottomAnchor.constraint(equalTo: cardView.bottomAnchor, constant: -24),
        ])
    }

    private func showSuccessAndClose() {
        guard !didSave else { return }
        didSave = true

        spinner.stopAnimating()
        UIView.transition(with: cardView, duration: 0.2, options: .transitionCrossDissolve) {
            self.iconLabel.text = "\u{2705}"  // ✅
            self.titleLabel.text = "Saved to Marks"
            self.subtitleLabel.text = "Open the app to review"
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.close()
        }
    }

    private func showError(_ message: String) {
        spinner.stopAnimating()
        UIView.transition(with: cardView, duration: 0.2, options: .transitionCrossDissolve) {
            self.iconLabel.text = "\u{26A0}\u{FE0F}"  // ⚠️
            self.titleLabel.text = "Couldn't save"
            self.subtitleLabel.text = message
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.close()
        }
    }

    // MARK: - URL Handling

    private func handleSharedURL() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            showError("No content found")
            return
        }

        for item in items {
            guard let attachments = item.attachments else { continue }
            let pageTitle = item.attributedContentText?.string ?? ""

            for provider in attachments {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] data, _ in
                        let urlString: String? = {
                            if let url = data as? URL { return url.absoluteString }
                            if let urlData = data as? Data,
                               let url = URL(dataRepresentation: urlData, relativeTo: nil) {
                                return url.absoluteString
                            }
                            if let text = data as? String, text.hasPrefix("http") { return text }
                            return nil
                        }()
                        Task { @MainActor in
                            guard let self else { return }
                            if let urlString {
                                await self.saveBookmark(url: urlString, title: pageTitle)
                            } else {
                                self.showError("Invalid URL")
                            }
                        }
                    }
                    return
                }

                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] data, _ in
                        Task { @MainActor in
                            guard let self else { return }
                            if let text = data as? String, text.hasPrefix("http") {
                                await self.saveBookmark(url: text, title: "")
                            } else {
                                self.showError("No URL found")
                            }
                        }
                    }
                    return
                }
            }
        }

        showError("No URL found")
    }

    // MARK: - Save

    @MainActor
    private func saveBookmark(url: String, title: String) async {
        let defaults = UserDefaults(suiteName: Config.appGroupID)
        var queue = defaults?.array(forKey: "pendingBookmarks") as? [[String: String]] ?? []
        queue.append(["url": url, "title": title])
        defaults?.set(queue, forKey: "pendingBookmarks")
        showSuccessAndClose()
    }

    // MARK: - Close

    private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
