import Foundation
import SwiftData

enum UITestSeeder {

    static var isUITest: Bool {
        ProcessInfo.processInfo.arguments.contains("-UITest")
    }

    /// Insert sample bookmarks into a fresh model context for screenshots.
    static func seed(context: ModelContext) {
        let samples: [(id: Int, url: String, title: String, desc: String, tags: [String], type: String?, isRead: Bool, daysAgo: Int)] = [
            (1, "https://paulgraham.com/greatwork.html",
             "How to Do Great Work — Paul Graham",
             "A deep essay on finding and doing great work.",
             ["essays", "career"], "article", false, 1),

            (2, "https://github.com/apple/swift-evolution",
             "Swift Evolution — Proposals for Swift",
             "The community-driven process for evolving the Swift language.",
             ["swift", "open-source", "dev"], nil, true, 2),

            (3, "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
             "WWDC 2026 Keynote Highlights",
             "All the biggest announcements from WWDC.",
             ["apple", "video"], "video", false, 3),

            (4, "https://arxiv.org/abs/2401.00001",
             "Scaling Laws for Language Model Agents",
             "Research paper on how agent capabilities scale.",
             ["ai", "research"], "pdf", false, 5),

            (5, "https://developer.apple.com/swiftui/",
             "SwiftUI Documentation — Apple Developer",
             "Official SwiftUI framework reference.",
             ["swift", "dev", "apple"], "article", true, 7),

            (6, "https://tonsky.me/blog/unicode/",
             "The Absolute Minimum Every Developer Must Know About Unicode",
             "A practical guide to understanding Unicode in 2026.",
             ["dev", "essays"], "article", false, 10),

            (7, "https://twitter.com/karpathy/status/1234567890",
             "Karpathy on Training Small Models",
             "Thread on efficient training for small LLMs.",
             ["ai", "twitter"], "tweet", false, 14),

            (8, "https://linear.app",
             "Linear — The Issue Tracker for Modern Teams",
             "A fast, beautiful project management tool.",
             ["tools", "dev"], "product", true, 21),
        ]

        let calendar = Calendar.current
        for s in samples {
            let date = calendar.date(byAdding: .day, value: -s.daysAgo, to: .now) ?? .now
            let bookmark = Bookmark(
                id: s.id,
                url: s.url,
                title: s.title,
                desc: s.desc,
                tags: s.tags,
                type: s.type,
                isRead: s.isRead,
                createdAt: date,
                updatedAt: date
            )
            context.insert(bookmark)
        }

        try? context.save()

        // Attach cached HTML to the first bookmark so ReaderView has content for screenshots
        if let first = try? context.fetch(FetchDescriptor<Bookmark>(predicate: #Predicate { $0.id == 1 })).first {
            let cached = CachedContent(bookmarkID: 1, html: """
                <p>The first step is to decide what to work on. The work you choose needs to have three qualities: it has to be something you have a natural aptitude for, that you have a deep interest in, and that offers scope to do great work.</p>
                <p>In practice you don't have to worry much about the third criterion. Ambitious people are if anything already too conservative about it. So all you need to do is find something you have an aptitude for and great interest in.</p>
                <p>That sounds straightforward, but it's often quite difficult. When you're young you don't know what you're good at or what different kinds of work are like.</p>
                """, plainText: "The first step is to decide what to work on.")
            context.insert(cached)
            first.cachedContent = cached
            try? context.save()
        }

        // Store a fake email for Settings screen
        UserDefaults.standard.set("you@marks.app", forKey: "userEmail")
        UserDefaults.standard.set(Date.now, forKey: "lastSyncDate")
    }
}
