import SwiftUI
import SwiftData

struct AddBookmarkView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @State private var url = ""
    @State private var title = ""
    @State private var tagInput = ""
    @State private var tags: [String] = []
    @State private var isSaving = false
    @State private var isFetchingMetadata = false
    @State private var fetchTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Form {
                Section("URL") {
                    TextField("https://...", text: $url)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .onChange(of: url) { _, newValue in
                            fetchMetadata(for: newValue)
                        }
                }

                Section("Title (optional)") {
                    HStack {
                        TextField("Page title", text: $title)
                        if isFetchingMetadata {
                            ProgressView()
                                .scaleEffect(0.8)
                        }
                    }
                }

                Section("Tags") {
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
                            }
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color(.systemGray6))
                            .clipShape(Capsule())
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
            .navigationTitle("Add Bookmark")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
        }
    }

    private func addTag() {
        let t = tagInput.trimmingCharacters(in: .whitespaces).lowercased()
        if !t.isEmpty, !tags.contains(t) {
            tags.append(t)
        }
        tagInput = ""
    }

    private func fetchMetadata(for rawURL: String) {
        fetchTask?.cancel()
        let trimmed = rawURL.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") else { return }

        fetchTask = Task {
            // Debounce — wait for user to finish typing/pasting
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }

            isFetchingMetadata = true
            defer { isFetchingMetadata = false }

            guard let meta = try? await SupabaseService.shared.fetchMetadata(url: trimmed),
                  !Task.isCancelled else { return }

            // Only fill in title if user hasn't typed one
            if title.trimmingCharacters(in: .whitespaces).isEmpty, let t = meta.title, !t.isEmpty {
                title = t
            }
            // Only add suggested tags if user hasn't added any yet
            if tags.isEmpty, let suggested = meta.suggestedTags, !suggested.isEmpty {
                tags = suggested
            }
        }
    }

    private func save() async {
        isSaving = true
        let cleanURL = url.trimmingCharacters(in: .whitespaces)
        let cleanTitle = title.trimmingCharacters(in: .whitespaces)

        // Save locally with pending sync status
        let bookmark = Bookmark(
            id: Int.random(in: 100_000...999_999), // temp ID, replaced on sync
            url: cleanURL,
            title: cleanTitle.isEmpty ? cleanURL : cleanTitle,
            tags: tags,
            syncStatus: .pending
        )
        context.insert(bookmark)
        try? context.save()

        // Try to push immediately via web API (which fetches page title automatically)
        do {
            let insert = SupabaseService.BookmarkInsert(
                url: cleanURL,
                title: bookmark.title,
                description: "",
                tags: tags
            )
            let response = try await SupabaseService.shared.createBookmarkViaWebAPI(insert)
            bookmark.id = response.id
            bookmark.title = response.title
            bookmark.syncStatus = .synced
            try? context.save()
        } catch {
            // Will sync later via SyncEngine which also uses web API
        }

        isSaving = false
        dismiss()
    }
}
