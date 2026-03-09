import Foundation

struct Tag: Identifiable, Hashable {
    let id: Int
    let name: String
    let bookmarkCount: Int

    init(id: Int, name: String, bookmarkCount: Int = 0) {
        self.id = id
        self.name = name
        self.bookmarkCount = bookmarkCount
    }
}
