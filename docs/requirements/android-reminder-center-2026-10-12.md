# Signed Android Reminder center acceptance — 2026-10-12

This verifies native preview behavior, not production/store readiness. The owner
asked to continue without the physical Pixel. Only the project-owned API 36
`CampusFlowNativeQa36` emulator, serial `emulator-5558`, ADB server 5039, was used.
The existing user AVD configuration remains unchanged. Source stays local.

## Artifacts and environment

The final app sources include main `e41f0dc327f81690ee9ac5f4fe10b49d2cd3d1b7`
(including the timezone/session synchronization change) and feature source commit
`88590df`. Later documentation/acceptance-script commits do not change app sources.

| Artifact | SHA-256 | Evidence |
| --- | --- | --- |
| x86 emulator preview | `6769217FEBA6AC0002E5C7778FBC92BA314349FF8CC8E9D9E166D19482D48B28` | v2 signature, actual x86 ABI and 25-permission gates; installed and exercised below |
| ARM phone preview | `6BBF2718C5957313DB7C89AF14F347436AC5FD87801EADF5A55BFA04192A7D5A` | v2 signature, actual ARM ABI and 25-permission gates; not installed on the absent phone |

Both assembled bundles contain the current API origin and Reminder center heading
and exclude nine known private synthetic email/password/session fixture values.
They use `http://localhost:3000` with forwarding to the retained loopback QA API
at port 18780. This is a local preview connection, not deployed HTTPS.

The retained native QA container has twelve migrations and compatible unchanged
task/reminder read and reminder-only patch contracts. It was not upgraded or
transferred to the server in this slice. The separate root-check database at port
55435 applies all thirteen current migrations and validates the current API.

## Actual interactions

The retained synthetic account has one task, “Today capture study block”, with
a date-only October 12 schedule, 20-minute estimate and no deadline. Only temporary
explicit reminders were added; the account/task were retained.

| Check | Observed result |
| --- | --- |
| Native center entry | The new signed APK restores the account and opens the real center with search, Upcoming/Earlier/All saved, refresh and notification settings |
| Native alarm | One app alarm matches the original UTC millisecond instant; account context and cache are refreshed before backgrounding |
| Warm tap, final x86 APK | A real posted generic Android notification is tapped while the app process remains backgrounded and API forwarding is absent; the center selects the owned task and shows saved-information messaging |
| Cold tap, final x86 APK | Android's protected previous activity first prevented background eviction. Opening Settings displaces it; `am kill` then proves CampusFlow's process absent. The posted notification is tapped with no API forwarding, and ordinary restored-session/cache initialization opens the exact saved task |
| Consumption | A subsequent force-stop and ordinary MAIN/LAUNCHER start while disconnected returns to Today and does not replay the consumed reminder |
| Subject Focus | The initial feature APK `62BD54101E2993E48FF432E9C85189C6F2EBF43F79B3643D7F8984D514230173` also proves the warm offline tap and exact task handoff: Focus shows the title and 20:00 ready block; no timer starts or record saves |
| Stale reminder | After clearing the exact synthetic reminder, native refresh explains that it is not in available information and withholds task actions |
| Invalid identities | Actual native links with a different account, malformed UTF-8 ID or repeated ID show the unavailable-link notice without a target action |
| Insets | The real acceptance CLI verifies fourteen standalone workspaces, including `/reminders`, with their own heading/nearest scroll viewport and first action within system bars |
| Narrow/large text | At 840x1920 pixels and 420 dpi (320 logical pixels), with 150% system text, the center passes its inset gate; scrolling exposes the selected task's Focus/edit/reminder actions. The exact reminder editor opens and cancels without saving |
| Display cleanup | Original size, density and font 1.0 are read back after removing the temporary size override |
| Data preservation | The temporary reminder is removed; independent API reads still show one task, no deadline/reminder and zero focus records. The previously approved disposable owner's token remains 401; the separate Pixel QA export fingerprint remains unchanged |

The first narrow snapshot during the display configuration change lacked the
workspace heading and was correctly rejected. A fresh observed settled screen and
repeat pass supply the evidence; the failed snapshot is not counted as acceptance.
Notification posting was checked through native metadata and the actual tray.
Polling observation times are not exact delivery times. Android's inexact delivery
was visible; no punctuality, Doze, reboot or other-device guarantee is inferred.

## Automated checks and private evidence

The integrated root `npm run check` passes 656 API, 1,037 mobile, 141 contract,
173 domain, 27 Android-tool and 25 release tests. The updated acceptance-tool suite
then passes 28 tests with zero skips, for **2,060 current tests**. Root lint,
TypeScript, API/shared builds, fresh web export and both native preview builds pass.
The added tool regression requires the Reminder center's own heading and checks
the reported route; an unrelated Help/auth screen cannot substitute for it.

Ignored local proofs include `reminder-native-integrated-{cold,warm}-proof.json`,
`reminder-native-cold-precondition.json`, `reminder-native-relaunch-proof.json`,
`reminder-native-invalid-links-proof.json`, `reminder-native-stale-proof.json`,
`reminder-native-geometry.json`, `reminder-native-large-text-proof.json`, both
`reminder-center-*-apk-proof.json` files and the integrated check/build logs.
Raw UI/native dumps and account/session fixtures stay private and are not shipped.

Before this feature, ten mounted native incoming-link cases on the retained Today
APK `B712AE01373BB32AAC94A6EAC6A6708FC45470EAB3587CCB1F706AA14C638591`
showed no visible runtime errors, preserved cold task/account restoration and
handled bounded malformed queries. An unknown path still reached SDK Unmatched
Route. These cases do not remove the bundled decoder advisory or establish
comprehensive incoming-link recovery.

Physical/older Android, iOS, screen-reader acceptance, production signing,
hosting/mail, public privacy/support and live institution-approved Canvas remain
separate release gates.
