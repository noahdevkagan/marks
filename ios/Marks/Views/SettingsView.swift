import SwiftUI
import SwiftData

struct SettingsView: View {
    @EnvironmentObject private var authVM: AuthViewModel
    @Environment(\.modelContext) private var context
    @Query private var bookmarks: [Bookmark]

    @State private var isSyncing = false
    @State private var lastSync: Date?

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
