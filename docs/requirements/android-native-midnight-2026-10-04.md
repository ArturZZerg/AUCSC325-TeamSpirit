# Android offline midnight acceptance — 2026-10-04

Result: a real account-local midnight passed on Pixel 10 Pro XL, including
background resume and cold offline startup. The APK and current local API are
identified in the [initial](android-native-acceptance-2026-10-04.md) and
[reminder](android-native-reminders-2026-10-04.md) reports.

## Setup and actual boundary

Register a disposable account in `Asia/Dhaka` through the native form. Its
October 4 day ended at `2026-10-04T18:00:00Z`, while the phone's system timezone
remained unchanged. Android automatic time was enabled. No device clock or time
settings were altered.

Seed three tasks through the authenticated local API: a date-only October 4
deadline, a date-only October 5 deadline and a timed deadline exactly at
`2026-10-04T18:00:00.000Z`. Add a daily goal in the account zone. On October 4,
Today displayed the first task and routine, with the October 5 tasks in Coming
up; the timed label showed October 5 at 00:00 in `Asia/Dhaka`.

Populate the native Today/snapshot cache, remove `tcp:3000` API forwarding and
background the app at approximately `17:50:32Z`. No October 5 Today request had
been opened on the phone. Keep the app offline across actual account midnight.

## Passed observations

| Phone check | Result |
| --- | --- |
| Resume after 18:00 UTC without API forwarding | Heading changed from Sunday, October 4 to Monday, October 5 |
| Prior date-only deadline | October 4 task remained in the plan and became overdue |
| Exact-midnight deadline | Moved from Coming up into the October 5 plan, retained its 00:00 label and was overdue after its instant passed |
| New date-only deadline | October 5 task appeared as today's task with no invented time |
| Daily routine | New day's routine appeared from the saved snapshot; scrolling exposed its card below the task cards |
| Failure status | Resume displayed the refresh-failure/saved-information message while preserving records |
| Force-stop and cold launch offline | Restored the October 5 heading, all three tasks, both overdue states and the routine; verified at approximately `18:02:26Z` |
| Reconnect and complete the routine | Goal history recorded `2026-10-05` as completed |
| End cleanup | Signed-out cold launch showed authentication; no pending CampusFlow alarms remained |

The new-day offline evidence was captured before reconnecting. It therefore
demonstrates account-calendar rollover and snapshot composition, rather than a
fresh October 5 server response or an explicitly selected future date. A write
helper initially chose a task's completion control; that disposable task was
restored and the goal check repeated with its verified visible button. That
attempt does not change the earlier offline observations.

## Remaining gates

This run proves background midnight resume, not the foreground timer or an actual
DST transition. Foreground rollover, native modal disposal across session expiry,
iOS, reboot/Doze delivery, live institutional Canvas and a verified campus feed
remain separate acceptance work. The API forwarding was restored after testing.
