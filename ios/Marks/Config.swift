import Foundation

enum Config {
    // MARK: — Supabase
    static let supabaseURL = URL(string: "https://pwrrtbvaynlsxckazczx.supabase.co")!
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cnJ0YnZheW5sc3hja2F6Y3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzAxMTMsImV4cCI6MjA4NzcwNjExM30.lOOTgbwoUW6-5XSQC_kJn3K_iO-1m565jQ4FXQR3LiA"

    // MARK: — Web App
    static let webAppURL = URL(string: "https://getmarks.sh")!

    // MARK: — App Group (shared between app + share extension)
    static let appGroupID = "group.com.noah.Marks"

    // MARK: — Defaults
    static let pageSize = 30
}
