# Android emulator acceptance — 2026-10-12

The owner asked to continue without the physical Pixel. This run uses a new
project-owned API 36 Google Play x86_64 AVD and a separate synthetic account in
the existing loopback production API/PostgreSQL testbed. It does not establish
physical Android, older Android, iOS, hosted availability or store acceptance.
Source, credentials and test data remain local.

## Build and isolation

Installing the ARM-only preview on the emulator succeeds, but React Native
immediately fails to load its native library. Advertised ARM translation is
therefore insufficient evidence of application compatibility. The explicit
`--emulator` build uses x86_64 and a separate artifact; ordinary previews remain
ARM64. Both builds inspect the actual APK's architecture and permission inventory
before copying it. No generated native file or dependency is committed.

The x86 preview builds and passes v2 signing with SHA-256
`21FEC5F075730C204EB6B63EAFDCBA4A9C2AB575EBD4179D38CDEBC3F2385669`.
Its actual APK bundle contains the selected localhost API/current Help and excludes
the known private synthetic credential/session values. It passes the 25-permission
policy, installs and launches. The preserved phone APK remains unchanged at
`7940AC915A07D7CABC13281368A338157816FDB0E8A0FAD0EE98ACF616963260`.

The AVD's registration, data and emulator/user home directories are inside
ignored `.local`. It does not copy or use the existing Medium_Phone userdata or
snapshots. The existing AVD configuration hash remains unchanged. WHPX is usable;
the installed SDK image is reused read-only, with no new tool download. The
headless emulator disables snapshot loading/saving and usage metrics. All device
operations use explicit serial `emulator-5558` and separate ADB server port 5039.
Only that emulator forwards port 3000 to the PC's loopback API port 18780.

## Verified native behavior

| Action | Observed result |
| --- | --- |
| Enter a password, open public Help, return to sign-in | Help opens without a session; the entered password is cleared |
| Ordinary native email/password sign-in | The new synthetic owner reaches Today through the production container |
| Open 13 standalone workspaces | The verified heading's main scroll viewport and first action fit observed system bars, y=63..2337 on the 1080x2400 emulator |
| Search Help for wifi, open its answer | One offline answer; the accordion expands with readable text and wrapped topics |
| Combine wifi with Study & planning, then reset | Zero results with a usable reset; all ten answers return |
| Prepare a native data copy and open sharing | Android's real JSON file chooser opens; cancellation returns to account controls with the closed-sheet message; no recipient/destination is selected |
| Save a dated study task through its native editor | Authenticated API confirms one task, 25-minute estimate and date-only 2026-10-12 deadline |
| Request device notifications through Settings | Android's real CampusFlow permission dialog opens; allowing it gives POST_NOTIFICATIONS granted=true |
| Save a near-term task reminder through its native editor | One server intent and one native RTC_WAKEUP alarm for 2026-10-13T00:17:00Z |
| Remove only the emulator API reverse, force-stop and cold-launch | Encrypted session restores; the saved task/deadline appear in Today with failed-refresh and saved-timetable notices; the one future alarm is restored from cached intent |
| Background the app with API forwarding absent | One notification for the exact reminder identifier posts at 2026-10-13T00:17:46.453Z, with the expected CampusFlow title/body; Android's inexact delay is 46.453 seconds |
| Replace the reminder through the native editor, refresh three times | API confirms the new 00:34:00Z intent; exactly one pending native alarm remains after every refresh |
| Disable Personal reminders, then enable | Pending alarm count changes from one to zero, then back to one |
| Remove the reminder in its native editor | API intent/configuration and all pending CampusFlow alarms are absent |
| Start task-linked focus, force-stop, cold-launch, use Today's recovery action | A paused checkpoint retains 23:46 of the 25-minute block; it offers explicit resume/save/discard controls |
| Save recovered time explicitly | API confirms exactly one linked interrupted focus record with 74 focused seconds, matching the paused checkpoint |
| Force-stop and open one cold Focus or Account URI | Each reaches its expected signed-in screen; the explicitly saved focus draft does not reappear |

Android's outer navigation container can appear as a full-window ScrollView in
the accessibility tree even when the workspace is inset. The geometry checker
now uses the nearest scroll ancestor of its unique verified heading. A regression
accepts this real hierarchy while still rejecting the old overlapping workspace,
auth substitution and another foreground package. Explicit device selection never
falls back to another ready phone; a failed ADB operation stops acceptance.

The full root lint/boundary/schema/type/test/build gate passes 1,972 tests:
646 API, 966 mobile, 135 contracts, 173 domain, 27 Android tooling and 25 release
checks. Five new target/inventory tests and eight PowerShell command/geometry
regressions pass. PowerShell regressions explicitly skip when that runtime is not
installed; native acceptance itself requires installed SDK tools and PowerShell.

## Remaining evidence

Broader account cleanup remains a separate observation. The changing running
timer prevents the standard UiAutomator command from reaching idle; lifecycle
restart and the paused recovery controls provide inspectable snapshots. A link
sent immediately during initial session restoration returned to Today in this
run; the observed recovery action opens the restored block. A later single cold
URI launch reaches Focus/Account as recorded above. The rapid two-start attempt
does not establish incoming-link race behavior or general malformed-link safety.

Delivery above establishes this emulator
run and does not promise punctual delivery in other power states.
The geometry gate does not prove every control, keyboard, cutout, orientation or
accessibility service behavior. Emulator results do not replace real hardware,
reboot/Doze/power-management or iOS acceptance. The disconnected Pixel's previous
temporary keep-awake preference still needs restoration when available; this run
does not operate on that phone.

Approved hosting/TLS, real mail delivery, public owner-approved policy/support
pages, intended campus deployment, live Canvas authorization, production signing
and store declarations/review remain release gates.

For repeatable build/target commands see the [preview guide](android-preview.md).
Android documents [separate emulator data directories and command options](https://developer.android.com/studio/run/emulator-commandline)
and [AVD/user home variables](https://developer.android.com/tools/variables).
