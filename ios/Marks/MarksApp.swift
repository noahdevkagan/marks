import SwiftUI
import SwiftData

@main
struct MarksApp: App {
    @StateObject private var authVM = AuthViewModel()

    let sharedModelContainer: ModelContainer

    init() {
        let schema = Schema([Bookmark.self, CachedContent.self])
        let config: ModelConfiguration
        if UITestSeeder.isUITest {
            config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        } else {
            config = ModelConfiguration(schema: schema)
        }
        do {
            sharedModelContainer = try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }

        if UITestSeeder.isUITest {
            UITestSeeder.seed(context: sharedModelContainer.mainContext)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authVM)
        }
        .modelContainer(sharedModelContainer)
    }
}
