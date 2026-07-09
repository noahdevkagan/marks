import XCTest

/// Regression test for App Review Guideline 2.1(a) rejection (v1.4.5):
/// tapping Save in the add-bookmark sheet blocked on a slow network call
/// and left the app looking unresponsive. Save must dismiss immediately
/// and the bookmark must appear in the list.
final class AddBookmarkFlowTests: XCTestCase {

    func testSaveDismissesImmediatelyAndAddsBookmark() {
        let app = XCUIApplication()
        app.launchArguments += ["-UITest"]
        app.launch()

        // Reviewer's steps: launch app → tap "+" → add URL → tap Save
        let addButton = app.buttons["addBookmarkButton"]
        XCTAssertTrue(addButton.waitForExistence(timeout: 10), "Add (+) button should exist")
        addButton.tap()

        let urlField = app.textFields["https://..."]
        XCTAssertTrue(urlField.waitForExistence(timeout: 5), "URL field should appear")
        urlField.tap()
        // Scheme-less, the way a reviewer would type it — the app must normalize it
        urlField.typeText("example.com")

        let saveButton = app.buttons["Save"]
        XCTAssertTrue(saveButton.waitForExistence(timeout: 5))
        XCTAssertTrue(saveButton.isEnabled, "Save should be enabled once a URL is entered")
        saveButton.tap()

        // The sheet must close right away — not after a network round-trip
        let sheetTitle = app.navigationBars["Add Bookmark"]
        let gone = NSPredicate(format: "exists == false")
        let dismissed = expectation(for: gone, evaluatedWith: sheetTitle)
        wait(for: [dismissed], timeout: 3)

        // The saved bookmark shows up in the list (offline-first local insert)
        let newRow = app.staticTexts.containing(
            NSPredicate(format: "label CONTAINS %@", "example.com")
        ).firstMatch
        XCTAssertTrue(newRow.waitForExistence(timeout: 5), "New bookmark should appear in the list")
    }
}
