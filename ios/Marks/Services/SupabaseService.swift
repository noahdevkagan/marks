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

    private var isRefreshing = false

    private func request(_ path: String, method: String = "GET", body: Data? = nil, query: [String: String] = [:], allowRetry: Bool = true) async throws -> Data {
        let data = try await rawRequest(path, method: method, body: body, query: query, allowRetry: allowRetry)
        return data
    }

    private func rawRequest(_ path: String, method: String = "GET", body: Data? = nil, query: [String: String] = [:], allowRetry: Bool = true) async throws -> Data {
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

        // On 401, try refreshing the token once and retry
        if http.statusCode == 401, allowRetry, !isRefreshing {
            if try await refreshSession() {
                return try await rawRequest(path, method: method, body: body, query: query, allowRetry: false)
            }
            throw SupabaseError.unauthorized
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

    /// Refresh the access token using the stored refresh token.
    /// Returns true if refresh succeeded.
    private func refreshSession() async throws -> Bool {
        guard let refresh = refreshToken else { return false }
        isRefreshing = true
        defer { isRefreshing = false }

        let body = try JSONEncoder().encode(["refresh_token": refresh])
        var components = URLComponents(string: baseURL + "/auth/v1/token")!
        components.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]

        var req = URLRequest(url: components.url!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(apiKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        req.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            clearTokens()
            return false
        }

        let auth = try decoder.decode(AuthResponse.self, from: data)
        saveTokens(access: auth.access_token, refresh: auth.refresh_token)

        // After refreshing, force a full re-sync so we get all data fresh
        UserDefaults.standard.removeObject(forKey: "lastSyncDate")
        return true
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

    func deleteAccount() async throws {
        // Call the web API route which uses the service role key to delete the user
        let components = URLComponents(string: Config.webAppURL.absoluteString + "/api/auth/delete-account")!
        var req = URLRequest(url: components.url!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Failed to delete account"
            throw SupabaseError.api(msg)
        }
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
        let bookmark_tags: [TagJoinRow]?

        // PostgREST returns 1-to-1 relations (archived_content has bookmark_id as PK)
        // as a single object or null, not an array. Handle both formats.
        let content_html: String?
        let content_text: String?

        var tags: [String] {
            bookmark_tags?.map { $0.tags.name } ?? []
        }

        private enum CodingKeys: String, CodingKey {
            case id, url, title, description, type
            case is_read, is_archived, created_at, updated_at
            case archived_content, bookmark_tags
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(Int.self, forKey: .id)
            url = try c.decode(String.self, forKey: .url)
            title = try c.decode(String.self, forKey: .title)
            description = try c.decodeIfPresent(String.self, forKey: .description)
            type = try c.decodeIfPresent(String.self, forKey: .type)
            is_read = try c.decodeIfPresent(Bool.self, forKey: .is_read)
            is_archived = try c.decodeIfPresent(Bool.self, forKey: .is_archived)
            created_at = try c.decode(String.self, forKey: .created_at)
            updated_at = try c.decodeIfPresent(String.self, forKey: .updated_at)
            bookmark_tags = try? c.decodeIfPresent([TagJoinRow].self, forKey: .bookmark_tags)

            // PostgREST v10+ returns 1-to-1 as object; older versions return array
            if let obj = try? c.decodeIfPresent(ArchivedContentRow.self, forKey: .archived_content) {
                content_html = obj.content_html
                content_text = obj.content_text
            } else if let arr = try? c.decodeIfPresent([ArchivedContentRow].self, forKey: .archived_content),
                      let first = arr.first {
                content_html = first.content_html
                content_text = first.content_text
            } else {
                content_html = nil
                content_text = nil
            }
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

        /// Encodes only the bookmark columns (not tags, which go in the junction table).
        private enum CodingKeys: String, CodingKey {
            case url, title, description
        }
    }

    private struct TagIDRow: Decodable { let id: Int }

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

        // Insert tags via the junction table
        if !insert.tags.isEmpty {
            try await setBookmarkTags(bookmarkID: row.id, tags: insert.tags)
        }

        return row
    }

    /// Resolve tag names to IDs (get-or-create) and insert into bookmark_tags junction table.
    private func setBookmarkTags(bookmarkID: Int, tags: [String]) async throws {
        for tagName in tags {
            // Upsert the tag (insert if not exists, return existing)
            let tagBody = try JSONEncoder().encode(["name": tagName])
            var upsertComponents = URLComponents(string: baseURL + "/rest/v1/tags")!
            upsertComponents.queryItems = [
                URLQueryItem(name: "on_conflict", value: "name"),
                URLQueryItem(name: "select", value: "id")
            ]
            var upsertReq = URLRequest(url: upsertComponents.url!)
            upsertReq.httpMethod = "POST"
            upsertReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
            upsertReq.setValue(apiKey, forHTTPHeaderField: "apikey")
            upsertReq.setValue("Bearer \(accessToken ?? apiKey)", forHTTPHeaderField: "Authorization")
            upsertReq.setValue("return=representation,resolution=merge-duplicates", forHTTPHeaderField: "Prefer")
            upsertReq.httpBody = tagBody

            let (tagData, _) = try await URLSession.shared.data(for: upsertReq)
            let tagRows = try decoder.decode([TagIDRow].self, from: tagData)
            guard let tagID = tagRows.first?.id else { continue }

            // Insert into junction table (ignore duplicates)
            struct JunctionInsert: Encodable { let bookmark_id: Int; let tag_id: Int }
            let junctionBody = try JSONEncoder().encode(JunctionInsert(bookmark_id: bookmarkID, tag_id: tagID))
            _ = try? await request("/rest/v1/bookmark_tags", method: "POST", body: junctionBody)
        }
    }

    struct BookmarkUpdate: Encodable {
        let title: String
        let description: String
        let is_read: Bool
        let is_archived: Bool
    }

    func updateBookmark(id: Int, _ update: BookmarkUpdate) async throws {
        let body = try JSONEncoder().encode(update)
        _ = try await request("/rest/v1/bookmarks", method: "PATCH", body: body, query: ["id": "eq.\(id)"])
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
