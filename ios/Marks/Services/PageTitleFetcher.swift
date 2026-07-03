import Foundation

/// Resolves bookmark titles on-device.
///
/// The web API extracts titles server-side, but that fetch runs on datacenter IPs
/// that bot-protected sites (Amazon, Reddit, Cloudflare-fronted blogs) reject.
/// A fetch from the phone looks like a real user and succeeds where the server
/// is blocked, so the sync engine resolves titles here before pushing.
enum PageTitleFetcher {

    private static let userAgent =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

    /// True when a saved share has no usable title (empty, or just the URL echoed back).
    static func needsTitle(_ title: String, url: String) -> Bool {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty
            || trimmed == url
            || trimmed.hasPrefix("http://")
            || trimmed.hasPrefix("https://")
            || trimmed.hasPrefix("file://")
    }

    /// Best-effort title for a URL. File URLs resolve to their filename (they can
    /// never be fetched, on-device or off); web URLs are fetched and parsed for
    /// og:title / <title>. Returns nil when nothing was found.
    static func title(for urlString: String, timeout: TimeInterval = 6) async -> String? {
        guard let url = URL(string: urlString) else { return nil }

        if url.isFileURL {
            let name = url.lastPathComponent
            return name.isEmpty || name == "/" ? nil : name
        }

        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return nil
        }

        var req = URLRequest(url: url)
        req.timeoutInterval = timeout
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        req.setValue("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", forHTTPHeaderField: "Accept")
        req.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")

        guard let (data, response) = try? await URLSession.shared.data(for: req),
              let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            return nil
        }

        // Titles live in <head>; 512 KB is plenty and keeps parsing cheap.
        let html = String(decoding: data.prefix(512 * 1024), as: UTF8.self)
        return extractTitle(fromHTML: html)
    }

    /// Pulls og:title (preferred) or <title> out of raw HTML.
    static func extractTitle(fromHTML html: String) -> String? {
        // og:title, tolerating either attribute order
        let ogPatterns = [
            #"<meta[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']"#,
            #"<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:title["']"#,
        ]
        for pattern in ogPatterns {
            if let match = firstMatch(pattern, in: html), !match.isEmpty {
                return clean(match)
            }
        }

        if let match = firstMatch(#"<title[^>]*>([\s\S]*?)</title>"#, in: html), !match.isEmpty {
            return clean(match)
        }

        return nil
    }

    private static func firstMatch(_ pattern: String, in text: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return nil
        }
        let range = NSRange(text.startIndex..., in: text)
        guard let result = regex.firstMatch(in: text, range: range),
              result.numberOfRanges > 1,
              let captured = Range(result.range(at: 1), in: text) else {
            return nil
        }
        return String(text[captured])
    }

    /// Decodes HTML entities and collapses whitespace.
    private static func clean(_ raw: String) -> String? {
        var s = raw

        // Numeric entities: &#8217; and &#x2019;
        if let numeric = try? NSRegularExpression(pattern: #"&#(x?)([0-9a-fA-F]+);"#) {
            let matches = numeric.matches(in: s, range: NSRange(s.startIndex..., in: s)).reversed()
            for m in matches {
                guard let full = Range(m.range, in: s),
                      let hexFlag = Range(m.range(at: 1), in: s),
                      let digits = Range(m.range(at: 2), in: s),
                      let code = UInt32(s[digits], radix: s[hexFlag].isEmpty ? 10 : 16),
                      let scalar = Unicode.Scalar(code) else { continue }
                s.replaceSubrange(full, with: String(Character(scalar)))
            }
        }

        let named: [String: String] = [
            "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"",
            "&apos;": "'", "&#39;": "'", "&nbsp;": " ",
            "&ndash;": "\u{2013}", "&mdash;": "\u{2014}",
            "&lsquo;": "\u{2018}", "&rsquo;": "\u{2019}",
            "&ldquo;": "\u{201C}", "&rdquo;": "\u{201D}",
        ]
        for (entity, char) in named {
            s = s.replacingOccurrences(of: entity, with: char, options: .caseInsensitive)
        }

        let collapsed = s
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        return collapsed.isEmpty ? nil : String(collapsed.prefix(300))
    }
}
