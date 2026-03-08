import Foundation

enum Config {
    // MARK: — Supabase
    static let supabaseURL = URL(string: "https://YOUR_PROJECT.supabase.co")!
    static let supabaseAnonKey = "YOUR_ANON_KEY"

    // MARK: — App Group (shared between app + share extension)
    static let appGroupID = "group.com.yourname.marks"

    // MARK: — Defaults
    static let pageSize = 30
}
