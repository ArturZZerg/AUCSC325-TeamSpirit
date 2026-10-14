# Unavailable-link recovery

CampusFlow's installed Router previously supplied its default unmatched-route
screen. A missing or outdated link should instead leave the student with a clear
route back to their daily workflow, even when offline.

| Requirement | Behavior | Verification |
| --- | --- | --- |
| LINK-RECOVERY-01 | Unknown paths show the generic CampusFlow recovery screen without displaying incoming path/query values | Screen tests and mounted installed-Router tests, including malformed escaping |
| LINK-RECOVERY-02 | After session restoration, a signed-out visitor can replace the unavailable screen with sign-in or offline Help; a signed-in student can return to Today | Restoring/signed-out/owned component cases and actual Router navigation |
| LINK-RECOVERY-03 | Only the exact `+not-found` leaf joins the existing public Help allowance; known private routes and safe Account continuation retain their access gate | Existing account-gate cases, new exact-leaf/nested rejection case and mounted Account protection |
| LINK-RECOVERY-04 | Actual native warm/cold unavailable links offer recovery, and an offline signed-in student returns to the existing cached task | Extended public Maestro flow and API-disconnected private storage flow, accepted only on passing exact-head native evidence |

The recovery screen uses the existing native controls, colors, scrollable layout
and safe-area container. Both actions wait for session restoration and navigate
to fixed application paths. Incoming parameters do not select a destination.
No backend endpoint, entity, mutation, notification behavior or dependency changes.

Twelve new behavior cases cover the screen, exact gate allowance and installed
Router. Mounted tests use the actual root layout/recovery screen and simple
downstream navigation-target fixtures. They do not establish full sign-in or
Today behavior; that remains part of the ordinary native storage acceptance.
The installed decoder invocation canary remains untouched for tested malformed
links. This does not remove that bundled dependency or prove every possible input.

Native acceptance retains the original first public Help link, Back navigation,
search, protected Account and cold Help checks. Warm and cold unknown-link checks
are appended afterward. The private flow first proves cold cached Today with the
API absent, then opens an unavailable link and returns to the same cached task.
Raw private hierarchy/screen content is not uploaded. Narrow/large-text browser
layout and actual native frames must be reviewed before claiming visual acceptance;
physical/older-device and App Store acceptance remain separate release gates.

## Local verification, 2026-10-13

`npm run check` passes lint, workspace boundaries, schema manifest, strict types,
available tests and build. The local API suite passes 400 cases and skips 256
database-dependent cases because the test PostgreSQL service is unavailable;
database-backed CI remains required. The targeted routing/access suite passes 32
cases, including all twelve new cases. The root lockfile is unchanged.

A fresh dotenv-disabled web export is served only on `127.0.0.1:18810`, with an
absent isolated API at port 18811. Playwright CLI 0.1.17 verifies actual unknown-link
recovery and fixed Help navigation; keyboard Tab/Enter reaches ordinary sign-in.
Reviewed frames at 320px, 320px with 150% browser zoom, and 1280px show readable
copy and both actions. At 320px, document width stays 320; buttons lie within
24..296 pixels and are 46px high. At 150% zoom they lie within 36..284 pixels and
are 69px high. Frames are local in
`output/playwright/native-link-recovery-20261013/`; both task-owned browser and
loopback server are stopped. The recovery screen has no console errors; ordinary
sign-in's capability fetch reports the expected absent-API connection error.
Browser zoom does not establish native font scaling, system insets or lifecycle.
Actual iOS warm/cold/owned-cache recovery now passes on the recorded sources below;
the complete native gate still requires logout acceptance. Android evidence follows.

The first feature native run (`bf1aa34`, `38472721279`) fails the original first
Help assertion before recovery scenarios. Standard PR/push checks pass. The feature
now inherits PR #83's corrected native storage gate (`6c36838`), retaining
the installed app/UUID and every original public/private requirement. A passing
fresh exact-head native run is required; later correct Help frames alone do not
accept the earlier timed-out assertion.

At `e787af9` (`38501083746`), the request phase passes, then first Help appears
within 681ms. Back/in-app Help/search/Account assertions pass. Cold Help opening
immediately after termination fails with OS timeout code 60, before recovery or
storage scenarios. Public cold Help and unknown-link phases now each use a separate
driver session after required termination, without an intervening app launch or
command retry. All four public results/JUnit reports and private acceptance remain
required; no successful later screenshot can waive a failed command.

## iOS simulator verification, 2026-10-13

At `7160802` (`38503469756`), all four required public JUnit flows pass with zero
failures, including original first Help/Back/search/Account/cold behavior and both
warm/cold unavailable links. Reviewed actual warm/cold recovery images show readable
copy and both fixed actions. Ordinary native sign-in captures exactly one task
confirmed independently through the API. Cold encrypted-session/owned SQLite
restoration succeeds with no API listener; the unavailable-link action returns to
the same cached task. Private screen contents are not uploaded.

The full run fails later during sign-out testing because its bare Settings
selector does not match the installed iOS tab's `Settings, tab, 5 of 5` label.
Process cleanup passes, but logout revocation/cache removal and final signed-out
startup are not accepted. The feature now inherits the exact tab selector,
verified Maestro 2.11.0/flat-artifact privacy handling and a bounded 60-minute
whole-job budget. All application assertions remain required. These integration
changes leave feature application sources identical to the exercised `7160802`
and Android artifacts; fresh exact-head full native acceptance remains mandatory.

## Android emulator verification, 2026-10-13

Fresh ARM and x86 previews pass actual architecture/25-permission checks, v2
signature verification, the current API/recovery bundle scan and exclusion of nine
known private synthetic fixture values. APK SHA-256 is
`45F0B3235D47B3EEC17652AF7CD07A98E4857730D80366989B8B4410937B22B0` (ARM) and
`9A205CE4F73491056A73F9BEBBFE17D4A14B9CAD49462564E97C6A2744B7778A` (x86).
These use `e787af9` application sources; subsequent integration changes only native
test flows/documentation. The ARM artifact is not installed on a physical phone.

The reviewed x86 app is installed only on the marked project-owned API 36 emulator
with existing data retained. API forwarding is absent. Cold encrypted-session/cache
restoration, warm/cold unknown links, ignored parameters, malformed escaping,
Back to Today and offline Help pass. The same retained task remains readable in
Tasks; it is scheduled for the prior calendar day, so current Today does not show
it. This does not substitute for the iOS gate's fresh current-day task assertion.
No task/account mutation is submitted. An initial System UI ANR obstructs the
foreground precondition; its observed Wait action restores access before the
successful repeat. The failed attempt is not counted as acceptance.

Reviewed actual normal and 320-logical-pixel/150%-system-text frames show readable
copy/actions. The narrow viewport fits y=63..1857; buttons fit x=63..777 and are
120/121 pixels high. The actual Help action succeeds at that size. Original size,
density and font are read back after restoration. The owned emulator is stopped
with data retained; no other devices are attached to its isolated server, so that
unused server is also stopped. Native proofs/images remain in ignored `.local`
as `recovery-android-*`; physical/older Android and iOS acceptance remain separate.

## Integration after accepted storage parent, 2026-10-14

PR #83 merges at `c08a0987222c3940bc59cd187f03e0e9e47aadea` after final source
`c3c2563` passes both standard checks, original warm/cold public navigation and
all four native API/cache/logout checks with an independently validated final
storage/cleanup record. Recovery is rebased onto that accepted tree; its actual
`+not-found` and root-gate file hashes match the earlier exercised `e787af9` code.
The parent retains its complete-proof guard, exact Settings tab selector and
uninstrumented one-session first-warm wrapper. All added recovery flows remain
required, including returning to the same cached task while the API is absent.

Native artifact names now include source and run attempt so retries retain earlier
evidence without duplicate uploads. YAML structure and both distinct artifact
identities are checked. All 1,099 mobile tests, 28 iOS tooling cases, lint and
strict mobile types pass after integration. Fresh exact-head native and standard checks, final source
review and post-merge main verification remain required; earlier partial runs
cannot substitute for the integrated recovery gate.

## Full native public-input parent integration

PR #86's complete public XCTest gate replaces the earlier public Maestro phase
after an actual unchanged-app comparison. Recovery retains every parent warm,
single-Back, in-app/legacy Help, search/answer/clear, protected Account, ignored
continuation and terminated-process Help assertion. It additionally requires the
same cold-Help process for the warm unavailable-link/ignored-parameter/sign-in
case, followed by a third distinct process for cold unavailable-link recovery to
Help. Both recovery stages are mandatory in the compiled-context-bound proof;
omitting either or substituting processes fails local verifier regressions.

The existing private Maestro/API-disconnected unavailable-link recovery to the
same owned task remains unchanged, along with every native login/capture/cache/
logout and SQL/cleanup assertion. Application files match the prior reviewed
recovery source. Fresh full current-source native and standard acceptance are
required before merging this integration; the successful subset comparison is
not sufficient. No physical-device or server source transfer is performed.
