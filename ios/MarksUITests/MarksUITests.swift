import XCTest

final class MarksScreenshots: XCTestCase {

    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments += ["-UITest"]
        setupSnapshot(app)
        app.launch()
    }

    func testTakeScreenshots() {
        // 1. Bookmark list — wait for seeded content to appear
        let firstCell = app.cells.firstMatch
        XCTAssertTrue(firstCell.waitForExistence(timeout: 10), "Bookmark cells should exist")
        snapshot("01_BookmarkList")

        // 2. Tap first bookmark to open reader view
        firstCell.tap()
        let backButton = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(backButton.waitForExistence(timeout: 5))
        sleep(1)
        snapshot("02_ReaderView")

        // Go back
        backButton.tap()

        // 3. Tags tab
        let tagsTab = app.tabBars.buttons["Tags"]
        XCTAssertTrue(tagsTab.waitForExistence(timeout: 5))
        tagsTab.tap()
        let firstTag = app.cells.firstMatch
        XCTAssertTrue(firstTag.waitForExistence(timeout: 5))
        snapshot("03_Tags")

        // 4. Settings tab
        app.tabBars.buttons["Settings"].tap()
        sleep(1)
        snapshot("04_Settings")

        // 5. Back to bookmarks — show search
        app.tabBars.buttons["Bookmarks"].tap()
        XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: 5))

        let list = app.collectionViews.firstMatch
        if list.exists {
            list.swipeDown()
            sleep(1)
        }
        snapshot("05_Search")
    }
}
