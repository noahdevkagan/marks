import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private let hudView = UIView()
    private let iconLabel = UILabel()
    private let titleLabel = UILabel()
    private var didComplete = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.3)
        setupHUD()
        showHUD(saving: true)
        handleSharedURL()

        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            self?.close()
        }
    }

    // MARK: - HUD

    private func setupHUD() {
        hudView.backgroundColor = .systemBackground
        hudView.layer.cornerRadius = 16
        hudView.layer.shadowColor = UIColor.black.cgColor
        hudView.layer.shadowOpacity = 0.15
        hudView.layer.shadowRadius = 12
        hudView.layer.shadowOffset = CGSize(width: 0, height: 4)
        hudView.translatesAutoresizingMaskIntoConstraints = false
        hudView.alpha = 0
        hudView.transform = CGAffineTransform(scaleX: 0.8, y: 0.8)

        iconLabel.font = .systemFont(ofSize: 36, weight: .semibold)
        iconLabel.textAlignment = .center
        iconLabel.translatesAutoresizingMaskIntoConstraints = false

        titleLabel.font = .systemFont(ofSize: 15, weight: .medium)
        titleLabel.textColor = .label
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        hudView.addSubview(iconLabel)
        hudView.addSubview(titleLabel)
        view.addSubview(hudView)

        NSLayoutConstraint.activate([
            hudView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hudView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            hudView.widthAnchor.constraint(equalToConstant: 180),
            hudView.heightAnchor.constraint(equalToConstant: 140),
            iconLabel.centerXAnchor.constraint(equalTo: hudView.centerXAnchor),
            iconLabel.topAnchor.constraint(equalTo: hudView.topAnchor, constant: 28),
            titleLabel.centerXAnchor.constraint(equalTo: hudView.centerXAnchor),
            titleLabel.topAnchor.constraint(equalTo: iconLabel.bottomAnchor, constant: 10),
        ])
    }

    private func showHUD(saving: Bool) {
        if saving {
            iconLabel.text = "\u{2026}"
            iconLabel.textColor = .secondaryLabel
            titleLabel.text = "Saving\u{2026}"
        } else {
            iconLabel.text = "\u{2713}"
            iconLabel.textColor = .systemGreen
            titleLabel.text = "Saved to Marks"
        }
        UIView.animate(withDuration: 0.25, delay: 0, usingSpringWithDamping: 0.7, initialSpringVelocity: 0.5) {
            self.hudView.alpha = 1
            self.hudView.transform = .identity
        }
    }

    private func dismissHUD() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            UIView.animate(withDuration: 0.2, animations: {
                self?.hudView.alpha = 0
                self?.hudView.transform = CGAffineTransform(scaleX: 0.8, y: 0.8)
                self?.view.backgroundColor = .clear
            }) { _ in
                self?.close()
            }
        }
    }

    // MARK: - URL Handling

    private func handleSharedURL() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            close()
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
                            if let data = data as? Data,
                               let url = URL(dataRepresentation: data, relativeTo: nil) {
                                return url.absoluteString
                            }
                            if let text = data as? String, text.hasPrefix("http") { return text }
                            return nil
                        }()
                        guard let urlString else {
                            Task { @MainActor in self?.close() }
                            return
                        }
                        Task { @MainActor in
                            await self?.saveBookmark(url: urlString, title: pageTitle)
                        }
                    }
                    return
                }

                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] data, _ in
                        guard let text = data as? String, text.hasPrefix("http") else {
                            Task { @MainActor in self?.close() }
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

    // MARK: - Save

    @MainActor
    private func saveBookmark(url: String, title: String) async {
        let defaults = UserDefaults(suiteName: Config.appGroupID)
        var queue = defaults?.array(forKey: "pendingBookmarks") as? [[String: String]] ?? []
        queue.append(["url": url, "title": title])
        defaults?.set(queue, forKey: "pendingBookmarks")
        showHUD(saving: false)
        dismissHUD()
    }

    // MARK: - Close

    private func close() {
        guard !didComplete else { return }
        didComplete = true
        extensionContext?.completeRequest(returningItems: nil)
    }
}
