import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            BookmarkListView()
                .tabItem {
                    Label("Bookmarks", systemImage: "list.bullet")
                }

            TagsView()
                .tabItem {
                    Label("Tags", systemImage: "tag")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
        .tint(Color("AccentColor"))
    }
}
