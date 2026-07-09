fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios screenshots

```sh
[bundle exec] fastlane ios screenshots
```

Take App Store screenshots

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build and upload to TestFlight

### ios upload_only

```sh
[bundle exec] fastlane ios upload_only
```

Upload only — re-uses the existing Marks.ipa (no rebuild)

### ios release

```sh
[bundle exec] fastlane ios release
```

Upload metadata and screenshots to App Store

### ios ship

```sh
[bundle exec] fastlane ios ship
```

Full release: build, upload binary + metadata

### ios ship_upload_only

```sh
[bundle exec] fastlane ios ship_upload_only
```

Upload existing Marks.ipa to App Store + push metadata (no rebuild)

### ios bump

```sh
[bundle exec] fastlane ios bump
```

Bump version number (e.g. fastlane bump version:1.4.1)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
