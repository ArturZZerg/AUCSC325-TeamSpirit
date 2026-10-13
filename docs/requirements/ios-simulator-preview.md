# iOS Release simulator preview

CampusFlow prioritizes native Android/iOS delivery. Android previews already have
actual native evidence; an iOS export alone does not prove native compilation or
startup. This gate builds and installs a Release app on a fresh iPhone simulator,
then exercises public navigation without account credentials or an API.
The initial unsigned gate is retained below as historical evidence. Current builds
retain Xcode's local ad-hoc signature and declare an app-private Keychain namespace
only for the explicit simulator build. The gate inspects the compiled simulated
entitlement section in every executable architecture. A disposable API/database flow checks authenticated
storage; it never treats simulator signing as Apple device/store signing.
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
| IOS-PREVIEW-07 | Reject incomplete/failed simulator migration even when bootstatus exits zero; retry at most one new job-owned UUID, then fail closed | Actual failed-migration regression, explicit inventory/name/state check and scoped boot helper; direct installed-app launch preflight |
| IOS-STORAGE-01 | Verify the actual app's local host signature and compiled simulator Keychain capabilities in every architecture, without invented team IDs or shared groups | Strict signature verification; actual Mach-O `__TEXT,__entitlements` extraction; negative host/device/slice artifact tests |
| IOS-STORAGE-02 | Ordinary native sign-in writes Secure Store and Today capture creates exactly one date-scheduled task through the real API | Disposable PostgreSQL 17 and NestJS preview API; native flow plus independent contract-validated API read |
| IOS-STORAGE-03 | Terminated-process startup restores the encrypted session and owned SQLite task with no API/Metro listener | Explicit API shutdown/port guard and native cold offline flow |
| IOS-STORAGE-04 | Native sign-out revokes its actual API session, removes owned SQLite rows, and cold startup stays signed out without an API while the server task survives | Before/after session/cache counts, online logout and separate API-disconnected cold signed-out flow; a server 401 cannot mask stale Secure Store |

The storage harness is restricted to the disposable macOS Actions runner and the
explicit booted `CampusFlowIosQa` UUID. It creates its own SCRAM-protected, loopback
PostgreSQL cluster, runs the current migrations and compiled NestJS API, and uses
ordinary preview registration/login. No authentication bypass or fixture transport
is compiled into the app. The API runs in development/preview mode because verified
registration requires approved SMTP. This does not establish production hosting or
email verification. The helper stops its own API and PostgreSQL instance on exit.
Credentials and Maestro private screenshots/dumps/logs stay in a restrictive ignored
directory and are not uploaded; only a bounded redacted assertion and sanitized
stage/check record are published. Public native logs/screenshots are collected before
creating the synthetic account. The initial storage run remains unverified until
actual exact-head native acceptance succeeds.

Private-flow diagnostics publish only whitelisted command kinds, status enums and
numeric duration/sequence, plus fixed known-label presence booleans on failure.
Selectors, typed values, variables, private paths, tokens and full UI hierarchies
remain in the ignored runner directory. A raw hierarchy or log is never a fallback.
These summaries diagnose the flow; label presence alone is not visibility proof.

At `019f64c` (`38460731027`), build, effective simulator capabilities, healthy
launch and the public flow pass (120 seconds, zero failures). Ordinary native
sign-in reaches Today, but the capture ID is not found before its tap. The actual
downloaded archive matches CI's hash and contains that selector, ruling out an
older bundle. Task save, offline restoration and logout are not accepted. The
flow now requires scrolling to the capture control before its single tap.
Failure hierarchy inspection disables the pinned CLI's default driver reinstall
with `--no-reinstall-driver`; this avoids an additional driver restart changing
the state under investigation. Known password-dialog label booleans help identify
an overlay without publishing its contents or assuming one is present. New native
acceptance remains required; no app state, routing or credentials are changed.

The first signed run (`751c960`, native `38373718950`) compiles with Xcode's ad-hoc
identity and passes strict signature verification, but its code-signature entitlement
dump is `{}`. The first gate rejects it before account creation. That gate was too
narrow: simulator capabilities may be embedded in `__TEXT,__entitlements`, so an
empty host signature alone does not prove their absence. The corrected pipeline
declares the private `com.campusflow.mobile` namespace as Expo/Xcode input only when
`CAMPUSFLOW_IOS_SIMULATOR=1`. It preserves Xcode's original signature and reads the
actual compiled section in both arm64 and x86_64 slices. iOS application/group
entitlements must not be manually added to the macOS host signature. No Apple team,
profile, APNs or shared group is invented. Device builds do not set this flag and
must use their real Apple team/profile. Native sign-in/cold restoration remain
required to prove usable storage; metadata alone is insufficient.

The corrected `9be7a3e` run (`38375810149`) builds and verifies the universal
simulator product with those exact effective entitlements and no APNs/unused
sensitive usage descriptions. Both standard checks pass 2,122 tests. Native app
acceptance does not pass: the simulator reports `Data Migration Failed` despite
bootstatus allowing continuation, then Maestro cannot launch CampusFlow. The final
frame is SpringBoard and no CampusFlow process log is available. This establishes
neither an app launch defect nor successful Keychain operations. Current workflow
requires successful finished migration and the explicitly booted QA UUID before
installing/testing; it can replace only its own failed fresh instance once. A
direct launch preflight and app-specific SpringBoard/runningboard diagnostics help
distinguish the next failure. Actual native public/private acceptance remains open.

The guarded `a61c0c6` run (`38379422576`) confirms successful migration and a booted
QA UUID, but direct native launch is denied before JavaScript with launchd spawn
error 162. Its manual signature contains iOS application/group entitlements. Thus
the previous migration problem does not explain this run. Manual post-build signing
is removed; Xcode now handles simulator entitlement placement. This correction is
supported by [WebKit's simulator/signature distinction](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/Scripts/process-entitlements.sh)
and [Bazel's Xcode simulator section investigation](https://github.com/bazelbuild/rules_apple/issues/106),
with actual compiled section inspection and native acceptance still required.

At `fea92e5` (`38452499305`), the actual Xcode signature and compiled simulator
sections pass in both architectures. Healthy direct launch and the original public
flow pass (one JUnit flow, zero failures, 140 seconds), including first Help/Back
navigation. The ordinary API login reaches Today, implying the awaited Secure Store
write succeeded, but the first capture tap does not produce the visible New task
assertion. No API-confirmed task or cold restoration is accepted. Cause remains
unproven. The current flow waits for navigation settlement, targets the actual
capture Pressable by stable ID, and requires New task within 30 seconds after one
tap; native capture/storage acceptance must still pass. App behavior is unchanged.

`b9a8377` (`38456971969`) builds and launches, but its public flow cannot leave
the first iOS `Open in CampusFlow?` dialog. The driver logs a tap at its Open
button's center (270,461); the final full frame still shows that system dialog,
and no incoming `UIOpenURLAction` reaches CampusFlow. The private stage is skipped.
The common confirmation subflow now settles the dialog before tapping and uses
Maestro's [documented unchanged-hierarchy tap retry](https://docs.maestro.dev/reference/commands-available/tapon)
only for that idempotent system Open action. It requires the dialog to disappear
within ten seconds, then the original expected app route. App Back/capture/save
actions remain single taps, with no retry added. No arbitrary links, coordinates
or app routing/auth behavior change. This addresses observed simulator input
delivery; new actual native acceptance is still required.

Installed Expo introspection originally produces `aps-environment: development`:
`expo-notifications` adds APNs entitlement even when only local reminders are used.
CampusFlow has no push-token registration or remote delivery backend. The final
local-reminder plugin removes that unused iOS entitlement after Expo's plugin;
installed-plugin introspection and actual signed-product checks require its absence.
Adding remote delivery later requires an explicit capability/signing decision.

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

The simulator API is deliberately `http://127.0.0.1:3000`. The public phase requires
no backend and makes no account writes. After public evidence is collected, the
storage phase starts its own loopback API and synthetic account, then stops the
API to require actual cached cold restoration. Neither phase establishes focus
persistence, reminders, sharing, deletion, physical-device behavior or real mail.

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

PR #82's exact-head public run passes, but its merged-main native run
`38371477582` fails Back-to-sign-in after opening the first Help link. The driver
log targets an in-button point; the final native frame remains Help. The cause is
unproven. Current flow adds Help animation settlement and a first-link screenshot,
then a bounded 30-second Back-screen assertion. The original order and single tap
remain required; a passing corrected native run is still needed.

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
