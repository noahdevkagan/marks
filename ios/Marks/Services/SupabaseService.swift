import Foundation

// MARK: — Supabase REST client (no external SDK needed)

@MainActor
final class SupabaseService {
    static let shared = SupabaseService()

    private let baseURL: String = {
        // Strip trailing slash for clean concatenation
        var url = Config.supabaseURL.absoluteString
        while url.hasSuffix("/") { url.removeLast() }
        return url
    }()
    private let apiKey = Config.supabaseAnonKey
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    private var accessToken: String?
    private var refreshToken: String?

    private init() {
        accessToken = UserDefaults.standard.string(forKey: "supabase_access_token")
        refreshToken = UserDefaults.standard.string(forKey: "supabase_refresh_token")
    }

    // MARK: — HTTP helpers

    private func request(_ path: String, method: String = "GET", body: Data? = nil, query: [String: String] = [:]) async throws -> Data {
        var components = URLComponents(string: baseURL + path)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        var req = URLRequest(url: components.url!)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(apiKey, forHTTPHeaderField: "apikey")

        if let token = accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else {
            req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        if let body { req.httpBody = body }

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw SupabaseError.unknown
        }
        if http.statusCode == 401 {
            throw SupabaseError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw SupabaseError.api(msg)
        }
        return data
    }

    // MARK: — Auth

    struct AuthResponse: Decodable {
        let access_token: String
        let refresh_token: String
        let user: AuthUser
    }

    struct AuthUser: Decodable {
        let id: String
        let email: String?
    }

    var currentUser: AuthUser? {
        get async {
            guard accessToken != nil else { return nil }
            do {
                let data = try await request("/auth/v1/user")
                return try decoder.decode(AuthUser.self, from: data)
            } catch {
                return nil
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        let body = try JSONEncoder().encode(["email": email, "password": password])
        let data = try await request("/auth/v1/token", method: "POST", body: body, query: ["grant_type": "password"])
        let auth = try decoder.decode(AuthResponse.self, from: data)
        saveTokens(access: auth.access_token, refresh: auth.refresh_token)
    }

    func signUp(email: String, password: String) async throws {
        let body = try JSONEncoder().encode(["email": email, "password": password])
        let data = try await request("/auth/v1/signup", method: "POST", body: body)
        let auth = try decoder.decode(AuthResponse.self, from: data)
        saveTokens(access: auth.access_token, refresh: auth.refresh_token)
    }

    func signOut() async throws {
        _ = try? await request("/auth/v1/logout", method: "POST")
        clearTokens()
    }

    private func saveTokens(access: String, refresh: String) {
        accessToken = access
        refreshToken = refresh
        UserDefaults.standard.set(access, forKey: "supabase_access_token")
        UserDefaults.standard.set(refresh, forKey: "supabase_refresh_token")
    }

    private func clearTokens() {
        accessToken = nil
        refreshToken = nil
        UserDefaults.standard.removeObject(forKey: "supabase_access_token")
        UserDefaults.standard.removeObject(forKey: "supabase_refresh_token")
    }

    // MARK: — Bookmarks

    struct ArchivedContentRow: Decodable {
        let content_html: String?
        let content_text: String?
    }

    struct TagJoinRow: Decodable {
        let tags: TagNameRow
    }

    struct TagNameRow: Decodable {
        let name: String
    }

    struct BookmarkRow: Decodable {
        let id: Int
        let url: String
        let title: String
        let description: String?
        let type: String?
        let is_read: Bool?
        let is_archived: Bool?
        let created_at: String
        let updated_at: String?
        let archived_content: [ArchivedContentRow]?
        let bookmark_tags: [TagJoinRow]?

        var content_html: String? {
            archived_content?.first?.content_html
        }
        var content_text: String? {
            archived_content?.first?.content_text
        }
        var tags: [String] {
            bookmark_tags?.map { $0.tags.name } ?? []
        }
    }

    func fetchBookmarks(since: Date? = nil) async throws -> [BookmarkRow] {
        var query: [String: String] = [
            "select": "*,archived_content(content_html,content_text),bookmark_tags(tags(name))",
            "order": "created_at.desc"
        ]
        if let since {
            let iso = ISO8601DateFormatter().string(from: since)
            query["updated_at"] = "gte.\(iso)"
        }
        let data = try await request("/rest/v1/bookmarks", query: query)
        return try decoder.decode([BookmarkRow].self, from: data)
    }

    struct BookmarkInsert: Encodable {
        let url: String
        let title: String
        let description: String
        let tags: [String]
    }

    func createBookmark(_ insert: BookmarkInsert) async throws -> BookmarkRow {
        var components = URLComponents(string: baseURL + "/rest/v1/bookmarks")!
        components.queryItems = []

        var req = URLRequest(url: components.url!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(apiKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(accessToken ?? apiKey)", forHTTPHeaderField: "Authorization")
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONEncoder().encode(insert)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SupabaseError.api("Failed to create bookmark")
        }
        let rows = try decoder.decode([BookmarkRow].self, from: data)
        guard let row = rows.first else { throw SupabaseError.api("No row returned") }
        return row
    }

    func deleteBookmark(id: Int) async throws {
        _ = try await request("/rest/v1/bookmarks", method: "DELETE", query: ["id": "eq.\(id)"])
    }

    /// Fetch archived content for a single bookmark from the server.
    func fetchArchivedContent(bookmarkID: Int) async throws -> ArchivedContentRow? {
        let data = try await request("/rest/v1/archived_content", query: [
            "select": "content_html,content_text",
            "bookmark_id": "eq.\(bookmarkID)"
        ])
        let rows = try decoder.decode([ArchivedContentRow].self, from: data)
        return rows.first
    }
}

// MARK: — Errors

enum SupabaseError: LocalizedError {
    case unauthorized
    case api(String)
    case unknown

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Not authenticated"
        case .api(let msg): return msg
        case .unknown: return "Unknown error"
        }
    }
}
