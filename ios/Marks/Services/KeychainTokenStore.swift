import Foundation
import Security

/// Stores Supabase auth tokens in the iOS Keychain.
///
/// UserDefaults is the wrong place for auth tokens: it's plain plist on disk,
/// is included in iCloud backups, and a few edge cases (e.g. settings restore,
/// "Reset All Settings", some iOS upgrade paths) have been observed to drop
/// values. Keychain entries — pinned to `kSecAttrAccessibleAfterFirstUnlock` —
/// persist reliably and are available to background sync after a reboot.
enum KeychainTokenStore {
    private static let service = "com.noah.Marks.auth"
    static let accessKey = "supabase_access_token"
    static let refreshKey = "supabase_refresh_token"

    static var accessToken: String? {
        get { read(key: accessKey) }
        set { write(key: accessKey, value: newValue) }
    }

    static var refreshToken: String? {
        get { read(key: refreshKey) }
        set { write(key: refreshKey, value: newValue) }
    }

    static func clear() {
        delete(key: accessKey)
        delete(key: refreshKey)
    }

    // MARK: — Internal

    private static func read(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private static func write(key: String, value: String?) {
        delete(key: key)
        guard let value, let data = value.data(using: .utf8) else { return }
        let attrs: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        SecItemAdd(attrs as CFDictionary, nil)
    }

    private static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}
