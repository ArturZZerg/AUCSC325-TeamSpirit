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
Actual iOS warm/cold/owned-cache recovery remains pending. Android evidence follows.

The first feature native run (`bf1aa34`, `38472721279`) fails the original first
Help assertion before recovery scenarios. Standard PR/push checks pass. The feature
now inherits PR #83's split-session native-link diagnostic (`50a2546`), retaining
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
