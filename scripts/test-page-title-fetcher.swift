// Test script for ios/Marks/Services/PageTitleFetcher.swift
//
// Run:
//   swiftc -parse-as-library ios/Marks/Services/PageTitleFetcher.swift \
//     scripts/test-page-title-fetcher.swift -o /tmp/test-page-title-fetcher \
//     && /tmp/test-page-title-fetcher

import Foundation

var passed = 0
var failed = 0

func check(_ name: String, _ actual: String?, _ expected: String?) {
    if actual == expected {
        passed += 1
        print("  ✓ \(name)")
    } else {
        failed += 1
        print("  ✗ \(name)\n      expected: \(expected ?? "nil")\n      actual:   \(actual ?? "nil")")
    }
}

func check(_ name: String, _ actual: Bool, _ expected: Bool) {
    check(name, String(actual), String(expected))
}

@main
struct TestMain {
    static func main() async {
        print("— extractTitle —")
        check("og:title standard order",
              PageTitleFetcher.extractTitle(fromHTML:
                #"<html><head><meta property="og:title" content="Real Title" /><title>Fallback</title></head></html>"#),
              "Real Title")
        check("og:title reversed attribute order",
              PageTitleFetcher.extractTitle(fromHTML:
                #"<meta content="Reversed Title" property="og:title" />"#),
              "Reversed Title")
        check("title tag fallback",
              PageTitleFetcher.extractTitle(fromHTML:
                "<head><title>Plain Title</title></head>"),
              "Plain Title")
        check("title tag with attributes",
              PageTitleFetcher.extractTitle(fromHTML:
                #"<title data-rh="true">Attributed Title</title>"#),
              "Attributed Title")
        check("multiline title collapses whitespace",
              PageTitleFetcher.extractTitle(fromHTML:
                "<title>\n  Line One\n  Line Two\n</title>"),
              "Line One Line Two")
        check("named entities decoded",
              PageTitleFetcher.extractTitle(fromHTML:
                "<title>Cats &amp; Dogs &ndash; A &quot;Guide&quot;</title>"),
              "Cats & Dogs \u{2013} A \"Guide\"")
        check("numeric entities decoded (decimal + hex)",
              PageTitleFetcher.extractTitle(fromHTML:
                "<title>It&#8217;s here &#x2014; finally</title>"),
              "It\u{2019}s here \u{2014} finally")
        check("no title returns nil",
              PageTitleFetcher.extractTitle(fromHTML: "<body><p>no head</p></body>"),
              nil)
        check("empty title returns nil",
              PageTitleFetcher.extractTitle(fromHTML: "<title>   </title>"),
              nil)
        check("case-insensitive tags",
              PageTitleFetcher.extractTitle(fromHTML: "<TITLE>Upper Case</TITLE>"),
              "Upper Case")

        print("— needsTitle —")
        check("empty title needs fetch",
              PageTitleFetcher.needsTitle("", url: "https://example.com"), true)
        check("whitespace-only title needs fetch",
              PageTitleFetcher.needsTitle("  \n ", url: "https://example.com"), true)
        check("URL echoed as title needs fetch",
              PageTitleFetcher.needsTitle("https://example.com/post", url: "https://example.com/post"), true)
        check("any http-prefixed title needs fetch",
              PageTitleFetcher.needsTitle("http://other.com", url: "https://example.com"), true)
        check("file URL as title needs fetch",
              PageTitleFetcher.needsTitle("file:///tmp/doc.pdf", url: "file:///tmp/doc.pdf"), true)
        check("real title does not need fetch",
              PageTitleFetcher.needsTitle("As I Lay Dying", url: "https://medium.com/x"), false)

        print("— title(for:) file URLs —")
        let fileTitle = await PageTitleFetcher.title(
            for: "file:///var/mobile/Library/SMS/Attachments/20/00/08CAD9E8/anthropic_case.pdf")
        check("file URL resolves to filename", fileTitle, "anthropic_case.pdf")
        let badScheme = await PageTitleFetcher.title(for: "ftp://example.com/x")
        check("non-http scheme returns nil", badScheme, nil)

        print("— live fetches (network) —")
        for (url, expectFragment) in [
            ("https://blogs.nvidia.com/blog/ai-5-layer-cake/", "cake"),
            ("http://live.tourtrackerprocycling.com/", "tour"),
        ] {
            let title = await PageTitleFetcher.title(for: url)
            let ok = title?.lowercased().contains(expectFragment) ?? false
            check("fetches \(URL(string: url)!.host ?? url) (got: \(title ?? "nil"))", ok, true)
        }

        print("\n\(passed) passed, \(failed) failed")
        exit(failed == 0 ? 0 : 1)
    }
}
