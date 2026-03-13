// SnapshotHelper.swift
// Minimal helper for fastlane snapshot — captures screenshots in UI tests.
// For the full version, run: fastlane snapshot init

import Foundation
import XCTest

var deviceLanguage = ""
var locale = ""

func setupSnapshot(_ app: XCUIApplication, waitForAnimations: Bool = true) {
    Snapshot.setupSnapshot(app, waitForAnimations: waitForAnimations)
}

func snapshot(_ name: String, waitForLoadingIndicator: Bool = true) {
    if waitForLoadingIndicator {
        sleep(1)
    }
    Snapshot.snapshot(name)
}

enum Snapshot {
    static var app: XCUIApplication?
    static var cacheDirectory: URL?
    static var screenshotsDirectory: URL? {
        return cacheDirectory
    }

    static func setupSnapshot(_ app: XCUIApplication, waitForAnimations: Bool = true) {
        Snapshot.app = app

        do {
            let cacheDir = try pathPrefix()
            Snapshot.cacheDirectory = cacheDir

            if let languageFile = try? String(contentsOf: cacheDir.appendingPathComponent("language.txt"), encoding: .utf8) {
                deviceLanguage = languageFile.trimmingCharacters(in: .whitespacesAndNewlines)
            }

            if let localeFile = try? String(contentsOf: cacheDir.appendingPathComponent("locale.txt"), encoding: .utf8) {
                locale = localeFile.trimmingCharacters(in: .whitespacesAndNewlines)
            }

            if let launchArgs = try? String(contentsOf: cacheDir.appendingPathComponent("snapshot-launch_arguments.txt"), encoding: .utf8) {
                let lines = launchArgs.components(separatedBy: .newlines).filter { !$0.isEmpty }
                app.launchArguments += lines
            }
        } catch {
            NSLog("Snapshot: Unable to find cache directory: \(error)")
        }

        if !deviceLanguage.isEmpty {
            app.launchArguments += ["-AppleLanguages", "(\(deviceLanguage))"]
        }

        if !locale.isEmpty {
            app.launchArguments += ["-AppleLocale", "\"\(locale)\""]
        }
    }

    static func snapshot(_ name: String) {
        guard let app = Snapshot.app else {
            NSLog("Snapshot: XCUIApplication not set up. Call setupSnapshot first.")
            return
        }

        let screenshot = app.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways

        #if os(iOS)
        let simulator = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] ?? "Unknown"
        #else
        let simulator = "Unknown"
        #endif

        if let cacheDir = Snapshot.cacheDirectory {
            let fileName = "\(simulator)-\(name).png"
            let fileURL = cacheDir.appendingPathComponent(fileName)
            do {
                try screenshot.pngRepresentation.write(to: fileURL)
                NSLog("Snapshot: saved \(fileName)")
            } catch {
                NSLog("Snapshot: error saving \(fileName): \(error)")
            }
        }
    }

    static func pathPrefix() throws -> URL {
        guard let homeDir = ProcessInfo.processInfo.environment["SIMULATOR_HOST_HOME"] ??
                            ProcessInfo.processInfo.environment["HOME"] else {
            throw NSError(domain: "Snapshot", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot find home directory"])
        }

        return URL(fileURLWithPath: homeDir)
            .appendingPathComponent("Library")
            .appendingPathComponent("Caches")
            .appendingPathComponent("tools.fastlane")
    }
}
