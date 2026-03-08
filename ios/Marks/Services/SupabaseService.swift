import Foundation
import Supabase

@MainActor
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabaseAnonKey
        )
    }

    // MARK: — Auth

    var currentUser: User? {
        get async {
            try? await client.auth.session.user
        }
    }

    func signIn(email: String, password: String) async throws {
        try await client.auth.signIn(email: email, password: password)
    }

    func signUp(email: String, password: String) async throws {
        try await client.auth.signUp(email: email, password: password)
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }

    // MARK: — Bookmarks

    struct BookmarkRow: Decodable {
        let id: Int
        let url: String
        let title: String
        let description: String?
        let tags: [String]?
        let type: String?
        let is_read: Bool?
        let is_archived: Bool?
        let created_at: String
        let updated_at: String?
        let archived_content: String?
        let archived_text: String?
    }

    func fetchBookmarks(since: Date? = nil) async throws -> [BookmarkRow] {
        var query = client.from("bookmarks").select()

        if let since {
            let iso = ISO8601DateFormatter().string(from: since)
            query = query.gte("updated_at", value: iso)
        }

        return try await query.order("created_at", ascending: false).execute().value
    }

    struct BookmarkInsert: Encodable {
        let url: String
        let title: String
        let description: String
        let tags: [String]
    }

    func createBookmark(_ insert: BookmarkInsert) async throws -> BookmarkRow {
        return try await client.from("bookmarks")
            .insert(insert)
            .select()
            .single()
            .execute()
            .value
    }

    func deleteBookmark(id: Int) async throws {
        try await client.from("bookmarks")
            .delete()
            .eq("id", value: id)
            .execute()
    }
}
