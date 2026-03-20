import SwiftUI
import SwiftData

struct SettingsView: View {
    @EnvironmentObject private var authVM: AuthViewModel
    @Environment(\.modelContext) private var context
    @Query private var bookmarks: [Bookmark]

    @State private var isSyncing = false
    @State private var lastSync: Date?
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    if let email = UserDefaults.standard.string(forKey: "userEmail") {
                        LabeledContent("Email", value: email)
                    }

                    Button("Sign Out", role: .destructive) {
                        Task { await authVM.signOut() }
                    }

                    Button("Delete Account", role: .destructive) {
                        showDeleteConfirmation = true
                    }
                }

                Section("Library") {
                    LabeledContent("Bookmarks", value: "\(bookmarks.count)")

                    let cached = bookmarks.filter { $0.cachedContent != nil }.count
                    LabeledContent("Cached Offline", value: "\(cached)")

                    let pending = bookmarks.filter { $0.syncStatus != .synced }.count
                    if pending > 0 {
                        LabeledContent("Pending Sync", value: "\(pending)")
                            .foregroundStyle(.orange)
                    }
                }

                Section("Sync") {
                    Button {
                        Task { await syncNow() }
                    } label: {
                        HStack {
                            Text("Sync Now")
                            Spacer()
                            if isSyncing {
                                ProgressView()
                            }
                        }
                    }
                    .disabled(isSyncing)

                    if let lastSync {
                        LabeledContent("Last Sync") {
                            Text(lastSync, style: .relative)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                }
            }
            .navigationTitle("Settings")
            .onAppear {
                lastSync = UserDefaults.standard.object(forKey: "lastSyncDate") as? Date
            }
            .alert("Delete Account", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    Task { await authVM.deleteAccount() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will permanently delete your account and all your bookmarks. This action cannot be undone.")
            }
        }
    }

    private func syncNow() async {
        isSyncing = true
        let engine = SyncEngine()
        try? await engine.sync(context: context)
        lastSync = .now
        isSyncing = false
    }
}
