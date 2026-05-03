import Foundation
import SwiftData

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var isSignedIn = false
    @Published var isLoading = true
    @Published var error: String?

    private let supabase = SupabaseService.shared

    init() {
        Task { await checkSession() }
    }

    func checkSession() async {
        // Optimistic: if we have credentials on disk, treat the user as
        // signed in immediately. Validate against the server in the
        // background, and only flip to signed-out on a confirmed rejection.
        // This prevents transient network/server errors at launch from
        // looking like "the app forgot my login".
        isSignedIn = supabase.hasStoredTokens
        isLoading = false

        guard isSignedIn else { return }

        switch await supabase.validateSession() {
        case .valid:
            isSignedIn = true
        case .invalid:
            isSignedIn = false
        case .unreachable:
            // Keep optimistic state; we'll re-validate next time.
            break
        }
    }

    func signIn(email: String, password: String) async {
        error = nil
        do {
            try await supabase.signIn(email: email, password: password)
            isSignedIn = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    func signUp(email: String, password: String) async {
        error = nil
        do {
            try await supabase.signUp(email: email, password: password)
            isSignedIn = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    func signOut(context: ModelContext? = nil) async {
        try? await supabase.signOut()
        if let context {
            try? context.delete(model: Bookmark.self)
            try? context.delete(model: CachedContent.self)
            try? context.save()
        }
        isSignedIn = false
    }

    func deleteAccount() async {
        error = nil
        do {
            try await supabase.deleteAccount()
            isSignedIn = false
        } catch {
            self.error = error.localizedDescription
        }
    }
}
