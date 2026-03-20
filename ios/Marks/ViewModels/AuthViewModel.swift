import Foundation

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
        isLoading = true
        let user = await supabase.currentUser
        isSignedIn = user != nil
        isLoading = false
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

    func signOut() async {
        try? await supabase.signOut()
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
