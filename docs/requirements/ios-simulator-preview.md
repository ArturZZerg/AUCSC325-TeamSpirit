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
| IOS-PREVIEW-04 | Start on ordinary sign-in, follow the first warm three-slash Help link, then exercise in-app Help, two-slash linking, search and an offline guide | `ios-public-first-warm.yaml` sequentially requires `ios-public-link-request.yaml` then `ios-public.yaml` in one XCTest session on the same installed app/UUID; whole-flow JUnit and screenshots |
| IOS-PREVIEW-05 | Require sign-in for Account, ignore Help's untrusted continuation and reopen Help after process termination | `ios-public.yaml` must finish by terminating the app, then `ios-public-cold.yaml` opens the link without launching first; all CLI/JUnit results and cold Help screenshot required |
| IOS-PREVIEW-06 | Bound and retain reproducible evidence without private student data | Read-only workflow permissions, fixed loopback API, public-only flow, explicit simulator identity, 60-minute whole-job budget and seven-day artifacts named by source and run attempt |
| IOS-PREVIEW-07 | Reject incomplete/failed simulator migration even when bootstatus exits zero; retry at most one new job-owned UUID, then fail closed | Actual failed-migration regression, explicit inventory/name/state check and scoped boot helper; direct installed-app launch preflight |
| IOS-STORAGE-01 | Verify the actual app's local host signature and compiled simulator Keychain capabilities in every architecture, without invented team IDs or shared groups | Strict signature verification; actual Mach-O `__TEXT,__entitlements` extraction; negative host/device/slice artifact tests |
| IOS-STORAGE-02 | Ordinary native sign-in writes Secure Store and Today capture creates exactly one date-scheduled task through the real API | Disposable PostgreSQL 17 and NestJS preview API; native flow plus independent contract-validated API read |
| IOS-STORAGE-03 | Terminated-process startup restores the encrypted session and owned SQLite task with no API/Metro listener | Explicit API shutdown/port guard and native cold offline flow |
| IOS-STORAGE-04 | Native sign-out revokes its actual API session, removes owned SQLite rows, and cold startup stays signed out without an API while the server task survives | Before/after session/cache counts, online logout and separate API-disconnected cold signed-out flow; a server 401 cannot mask stale Secure Store |

PR #83 is merged at `c08a0987222c3940bc59cd187f03e0e9e47aadea` after both
standard checks and final uninstrumented native run `38603642902` attempt 2 pass
on `c3c25638596df891c1a5dfe6e757b603dd3f0567`. The final `storage.json` is
downloaded and independently validated for that exact source, all four checks
and passed process cleanup. Warm/cold public JUnit reports each have zero failures.
The merged tree matches the reviewed tree; exact post-main checks are still required.

Each artifact name includes the source commit and `github.run_attempt`. Retrying
must preserve prior evidence and upload new evidence under a distinct name. In
the accepted parent retry, the two failed-attempt artifacts were preserved locally
with hashes before clearing their duplicate remote names; failed run logs remain.
The following documentation records the earlier investigation chronologically.

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

At `ab46128` (native run `38472473944`), the original first warm Help assertion
fails again. The system delivers `UIOpenURLAction` about six seconds after the
failure screenshot, despite the 45-second assertion. The recovery branch repeats
this before any recovery scenario. Later frames show Help; this does not pass the
required timely assertion or establish an app routing defect. The next diagnostic
splits requesting/confirming that original link from observing its result into two
CLI sessions. The first CLI must succeed; the second skips driver reinstallation
and immediately requires Help within the original bound. There is no app relaunch,
reset, intervening navigation or additional sleep. Both JUnit reports are retained.
This tests possible observation-related delivery delay; only a fresh native result
can confirm whether the change helps, and every subsequent public/storage assertion
remains required.

The split-session run at `854b846` (`38500933706`) fails in the request phase:
the system confirmation remains visible, and the observation phase never starts.
Its trace records one Open tap at 270,461 points, inside the observed native
button, despite `retryTapIfNoChange`. The final full frame still contains the
dialog and no incoming URL is delivered. This leaves the handoff hypothesis
untested. The confirmation helper now settles animation, checks that exact
dialog again and permits one additional idempotent Open tap only while it is
still visible. Required dismissal and every application assertion remain intact;
application Back/capture/save taps are not retried. Native acceptance is pending.

The dependent recovery run at `e787af9` (`38501083746`) does exercise the handoff:
its request phase passes; observation immediately finds Help (681ms), and both
Back actions, in-app Help, two-slash linking, search/answer/reset, Account protection
and ignored Help continuation pass. This is one positive result, not a root-cause
proof. The next cold Help `openLink`, immediately after `stopApp`, fails with
native `NSPOSIXErrorDomain` code 60 / operation timeout before its Help assertion.
Later Help frames do not accept that failed command. The flow now ends its driver
session after required termination, then requests/asserts cold Help in a separate
session without any intervening app launch/reset or command retry. All three
public phases must pass before private acceptance; every JUnit report is retained.

Private-flow diagnostics publish only whitelisted command kinds, status enums and
numeric duration/sequence, plus fixed known-label presence booleans on failure.
Selectors, typed values, variables, private paths, tokens and full UI hierarchies
remain in the ignored runner directory. A raw hierarchy or log is never a fallback.
These summaries diagnose the flow; label presence alone is not visibility proof.

The next driver update pins official Maestro 2.11.0 and its verified release ZIP
SHA-256 `5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a`.
The [upstream changes since 2.6.1](https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/CHANGELOG.md#270)
include stop/start timeout handling, tap positions after scrolling and hierarchy
retrieval fixes relevant to observed failures. This is not a confirmed diagnosis.
The verified local ZIP runs version/test-help commands with installed Java 17;
no local device command is used. The separate exact-source comparison at `d3ec781`
keeps the original 2.6.1 attempts intact; its standard CI passes all 2,132 tests
and its native run `38506104393` fails the required dismissal of the observed
Not Now control before task capture. Process cleanup passes; that comparison
does not establish storage or driver correctness.

Newer driver bundles use flat `commands.json` and capture additional step images,
hierarchies and device logs. Private output roots remain inside the restrictive
ignored runner directory. The diagnostic reader accepts both legacy and flat
command filenames and emits the same whitelisted action/status/numeric record;
it never copies manifests, screenshots, hierarchies, artifact paths or raw logs.
Two new file-based regressions prove private contents are excluded and malformed
JSON does not trigger a raw/manifest fallback. Twenty-two local tooling/privacy
cases, lint and YAML checks pass. Required public/storage assertions are unchanged;
fresh exact-head native acceptance of the updated driver remains required.

The `50a2546` native run (`38503168076`) passes all three public JUnit flows
(83/53/14 seconds), ordinary native sign-in/API-confirmed capture and cold session/
SQLite restoration with no API listener. The workflow is cancelled at its
40-minute boundary during sign-out testing, leaving logout unverified and no
completed storage record. Boot required its second fresh UUID. The `7160802`
recovery run (`38503469756`) passes all four public flows and the same private
capture/offline checks, including owned recovery, then fails the bare Settings
selector before sign-out. Its sanitized process-cleanup result passes.

The installed five-tab navigator gives iOS the label `Settings, tab, 5 of 5`;
the pinned driver's text filter matches the whole label. Cleanup now taps that
exact accessible tab once. Fixed Settings/tab/sign-out presence booleans improve
diagnosis without exposing account content. The whole job budget is 60 minutes
to accommodate provisioning, separate public driver phases and all private
stages; the existing screen assertion bounds and every API/cache/logout check
remain required. Neither cancelled/failed run accepts logout. Fresh exact-head
standard/native success is required before merge.

The current `6c36838` storage run (`38508047049`) and `b536252` recovery run
(`38508800285`) both fail the first Back-to-sign-in assertion before private
testing. The first Help link arrives, the button is enabled, and XCTest taps
inside its bounds. UIKit dispatches corresponding events to CampusFlow's window;
the final native frame remains Help. Neither the callback nor navigation dispatch
is proven by the driver's completed tap status. Source inspection finds no
confirmed app-guard or stack-replacement defect.

The next diagnostic leaves every application action and assertion unchanged.
Only the CI simulator build enables `EXPO_PUBLIC_IOS_PUBLIC_DIAGNOSTICS=1`.
Signed-out Help logs press-in/out/onPress and the fixed auth replacement target;
the root logs only `help`, `auth` or `other` route categories, and auth logs its
mount. Output is capped at 64 fixed enum events per process. URLs, route objects,
parameters, form values and account identifiers are never accepted, and logger
failure cannot interrupt navigation. Ordinary builds are silent. Public logs
are still collected before the synthetic account exists. These temporary probes
distinguish responder, dispatch and presentation failures; they do not fix or
accept the failed flow. Four new diagnostic/component cases and the existing
navigation cases pass (34 scoped tests), along with 22 iOS tooling cases,
mobile types and lint. Fresh exact-head native acceptance remains required.

The diagnostic `3b0a827` run (`38511768603`) fails Back again, but changes the
next investigation: the same CampusFlow process logs consecutive route controls
and Back press-in/out, with no `onPress` or auth replacement. BackBoard explicitly
cancels an active touch destined to CampusFlow after its virtual digitizer is
removed. The requested down/up coordinates are identical, and hierarchy reads
do not overlap the touch. A successful system Open control normally releases its
contact before cleanup. Native injected-touch cancellation is confirmed; the
duplicate digitizer registration's precise cause remains unproven.

The two public CLIs start different XCTest runner processes despite
`--no-reinstall-driver`. Changing that flag alone would not refresh the already
fresh process before Back. In this run Help arrives before the first CLI ends,
so the next comparison keeps both original warm subflows in one XCTest session
through an ordered `runFlow` wrapper. This removes the runner handoff without
changing the first link, intervening app state, Back action or expected screen.
The entire warm JUnit must pass before the separate post-termination cold phase
and every private API/session/cache/logout gate. Temporary app markers remain
for comparison and must be removed before final uninstrumented acceptance.
This is a diagnostic lifecycle experiment, not a confirmed fix or a waived gate.

At `69732c4` (`38597508153`), the ordered warm flow passes all assertions in
147 seconds, and the separate cold Help flow passes in 21 seconds. Masked helper
logs and sanitized timelines show all four actual native storage checks passing:
ordinary capture, offline cold restoration, online session/cache cleanup and
offline cold signed-out startup. This is positive instrumented native evidence;
the nominally successful job is not accepted as completed process cleanup.

Artifact review finds no `storage.json`: repeated cleanup waits for an `exit`
event from an API child already terminated by a signal (`exitCode=null`,
`signalCode=SIGTERM`). Its unresolved promise can outlive the last timer, allowing
Node to exit zero before final publication. Shutdown now treats normal and signal
exits as terminal, is idempotent, and has bounded SIGTERM/SIGKILL confirmation.
An unconfirmed stop fails. The workflow independently requires a complete proof
with all four checks, passed process cleanup and the exact source commit; a green
process exit or missing summary is insufficient. Six new real-process/bounded/
privacy-proof regressions pass (28 iOS tooling tests total). Temporary app probes
and their CI flag are removed. Final uninstrumented native acceptance with the
published summary remains required before merging and verifying main.

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

At `a85fa8e` (`38468138262`), the public flow passes again (131 seconds, zero
failures), but capture scrolling fails after sign-in. Non-reinstalling failure
inspection now finds the exact `Not Now` control while app screen labels are
absent. That control does not occur in CampusFlow source, supporting a system
prompt obstruction; the full prompt's identity is not established. The private
flow conditionally declines that observed prompt, requires its disappearance
within ten seconds, and requires Today again before scrolling/capture. Only this
idempotent system gesture uses unchanged-hierarchy retry. Application capture/save
remain single taps; all task/API/offline/logout requirements remain required.
No native storage acceptance is claimed from this failure. Both standard checks
pass the exact head; process cleanup passes. The separately validated recovery
feature remains local on `codex/native-link-recovery` at `25443bf` pending this PR.

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
macOS 15/Xcode 26.2 and a checksum-verified Maestro CLI 2.11.0; it runs locally on
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
- [Pinned Maestro release](https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.11.0)
- [Local Maestro CLI reference](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options.md)
