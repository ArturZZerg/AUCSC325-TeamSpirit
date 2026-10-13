# iOS Release simulator preview

CampusFlow prioritizes native Android/iOS delivery. Android previews already have
actual native evidence; an iOS export alone does not prove native compilation or
startup. This gate builds and installs an unsigned Release app on a fresh iPhone
simulator, then exercises public navigation without account credentials or an API.
It uses the existing GitHub Actions infrastructure and the architecture's Maestro
test tool; it does not deploy CampusFlow to the owner's server.

## Requirements and verification

| ID | Behavior | Evidence |
| --- | --- | --- |
| IOS-PREVIEW-01 | Build native iOS with the installed supported toolchain and embedded Release JS, without Metro or signing credentials | `build-ios-simulator.sh`; actual Xcode job and archive |
| IOS-PREVIEW-02 | Inspect the product's simulator platform, identity, executable architectures, incoming-link scheme and selected API in the actual bundle | `ios-preview.mjs`; positive and invalid/stale artifact tests; generated product record |
| IOS-PREVIEW-03 | Avoid unused sensitive capability prompts and arbitrary insecure HTTP access | Native Info.plist gate; installed Expo plugin introspection; Face ID/global cleartext regressions |
| IOS-PREVIEW-04 | Start on ordinary sign-in and open public Help, search and expand an offline guide | `ios-public.yaml`; actual Maestro assertions, JUnit and screenshots |
| IOS-PREVIEW-05 | Require sign-in for Account, ignore Help's untrusted continuation and reopen Help after process termination | Actual Maestro assertions and cold Help screenshot |
| IOS-PREVIEW-06 | Bound and retain reproducible evidence without private student data | Read-only workflow permissions, fixed loopback API, public-only flow, explicit simulator identity, 40-minute timeout and seven-day artifacts |

The `com.campusflow.mobile` simulator identifier matches the existing Android
preview identity. It is not an owner-approved App Store registration or signing
identity. Tablet, older iOS and physical iPhone acceptance remain unverified.
Secure Store continues to store sessions; the app does not request biometric
authentication and now omits the unused Face ID usage declaration. The network
policy disables arbitrary HTTP, retaining local networking for development.

## Running and inspecting

On macOS with Xcode 26+ and CocoaPods, install from the root lockfile with `npm ci`,
then run `npm run build:ios:simulator`. The script supports `--check` when invoked
directly. Windows cannot compile this native target. The checked-in workflow uses
macOS 15/Xcode 26.2 and a checksum-verified Maestro CLI 2.6.1; it runs locally on
its runner, without a Maestro Cloud account or EAS/store upload.

The simulator API is deliberately `http://127.0.0.1:3000`. No backend is started
and no login, account creation or student-data write is performed. Public Help
must work despite the unavailable API. This does not verify signed-in cache,
SQLite/session recovery, focus persistence, reminders, sharing, deletion or mail.

Artifacts: `artifacts/ios/campusflow-simulator.zip` contains `CampusFlow.app`;
`artifacts/ios/evidence` contains actual product/toolchain/archive metadata,
public-flow JUnit, screenshots and diagnostics. Install the app using `xcrun
simctl install <own-simulator-udid> <app-path>`. Target only your selected
simulator. Never install this simulator product on an iPhone or call it an IPA.

Only successful native builds publish the app archive. Evidence is also retained
on failure, which does not imply successful startup or a passing UI flow. Review
the actual JUnit/screenshots and exact run SHA before accepting a release claim.

## Current status

Local artifact/configuration regressions, lint/types and syntax validation are
the preparation gate. Native CI compilation and public flow results must be
recorded after their actual run; they are not presumed by this document.

## Sources

- [SDK 55 toolchain requirements](https://expo.dev/changelog/sdk-55)
- [macOS 15 runner toolchain inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md)
- [Pinned Maestro release](https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.6.1)
- [Local Maestro CLI reference](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options.md)
