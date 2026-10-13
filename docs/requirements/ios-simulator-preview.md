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
| IOS-PREVIEW-04 | Start on ordinary sign-in, follow the first warm three-slash Help link, then exercise in-app Help, two-slash linking, search and an offline guide | `ios-public.yaml`; actual Maestro assertions, JUnit and screenshots |
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

Standard CI at diagnostic source `799d2e1199647e440032f14e49a007c138c07e20`
passes 2,112 tests plus lint/types/build, web export and restore rehearsal.
[Native run 38357966689](https://github.com/ArturZZerg/AUCSC325-TeamSpirit/actions/runs/38357966689)
builds an actual unsigned universal x86_64/arm64 Release simulator app with
Xcode/iOS SDK 26.2, minimum target 15.1, correct scheme and API, no sensitive usage
descriptions or background modes, and no global HTTP allowance. Its archive
SHA-256 is `14a7f91b4750a918b39d92e21c3821abbc2d1d4eb8e8c6698dad754d90fa2954`.

That public flow passes all assertions and cold reopening (one JUnit flow,
zero failures). Reviewed screenshots show readable sign-in/Help/search/answer
controls. A full `simctl` frame confirms proper system-bar spacing: Maestro's
app screenshots omit system chrome and must not alone prove device insets.

The first run at `385a093` compiled and started, but failed the first warm Help
link assertion while still on sign-in after iOS confirmation. Its first sign-in
screenshot was an unsettled blank frame. The subsequent diagnostic run waits for
settled animation and exercises in-app Help before its links; its unchanged
native forwarding logs show Expo returning false, React Native returning true,
and correct Help/account/auth routes. That does not by itself explain or waive
the original failure. Temporary callback/route probes are removed and the final
flow restores the original first warm three-slash link before any in-app Help
navigation. The uninstrumented `1b4c8e1` run repeats that assertion timeout, but
its native log receives the first URL at 07:31:20 UTC, after the 17-second
assertion ended; its later full native frame shows the correct Help screen.
The first system-confirmed link therefore gets a bounded 45-second visible wait
and animation settlement after Open. The original first-link order and expected
screen remain required. This is an observed simulator/confirmation delivery delay,
not proof of an app routing defect or a delivery-time guarantee.

Unsigned native logs also report Keychain error `-34018` for missing entitlements.
This public-flow gate cannot establish usable signed-in Secure Store or notification
registration. A properly signed simulator/device build with actual storage acceptance
is required before claiming those capabilities.

Accept only actual final-source success, recorded with the
[PR](https://github.com/ArturZZerg/AUCSC325-TeamSpirit/pull/81)'s checks and reviewed
artifacts. A diagnostic build is not a production or signing claim.

## Sources

- [SDK 55 toolchain requirements](https://expo.dev/changelog/sdk-55)
- [macOS 15 runner toolchain inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md)
- [Pinned Maestro release](https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.6.1)
- [Local Maestro CLI reference](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options.md)
