# Android native editor acceptance — 2026-10-04

The Pixel 10 Pro XL ran the same ARM64 APK recorded in the
[first native report](android-native-acceptance-2026-10-04.md), with the current
rebuilt/restarted local API described in the [reminder report](android-native-reminders-2026-10-04.md).
All writes used disposable development accounts. No application code was changed.

## Passed phone checks

| Native action | Observed result |
| --- | --- |
| Create task with estimated duration 30, date-only deadline October 5, timed schedule October 5 at 09:30 and daily recurrence | Refreshed card displayed the separate values in `Pacific/Kiritimati`; API stored the schedule at October 4 19:30 UTC and the deadline as a calendar date |
| Change duration to 45 with the API disconnected | Save failed visibly and retained the draft; restoring forwarding and retrying saved 45 with one task record and the original schedule intact |
| Clear duration and remove recurrence | API returned explicit null values, duration/repeat labels disappeared, and the existing timed schedule remained unchanged |
| Complete the resulting one-time task and open its editor | Editor required undo before adding a repeat rule; Daily and Weekly controls were disabled; explicit undo remained available after cancellation |
| Create weekly-target goal with target 2 and zone `America/Edmonton` | Failed offline save retained title, target and timezone; retry created one goal and showed the expected Monday–Sunday progress |
| Edit that goal to selected weekdays including Sunday, then Skip today | Native card displayed Selected days and then Skipped today; history recorded October 4 in the goal zone while the account calendar was October 5 |
| Enter spring-DST deadline `2025-03-09 02:30` in `America/Edmonton` | Native form rejected the missing wall time with a correction message |
| Enter fall-DST deadline `2025-11-02 01:30` in the same zone | With exact input verified, native form rejected the repeated wall time with a correction message |
| Save valid fall-DST deadline `2025-11-02 03:30` | Refreshed card retained the local value; API stored `2025-11-02T10:30:00.000Z` |
| Register a fresh `Asia/Dhaka` account through the app | Form accepted the entered timezone and opened the authenticated October 4 Today screen; subsequent API login confirmed the new account |

The repeated-hour test was rerun after an input-automation artifact added an
extra character. Only the verified exact-input result above is accepted. These
historical fixtures exercise the native runtime's timezone conversion and form
validation, not a real device clock crossing a DST transition.

## Validation and remaining gates

Native UI hierarchies and authenticated REST reads were compared after writes
settled. Existing task/goal/editor/date tests, lint, typecheck, API/shared builds
and mobile web export passed in this session; this documentation adds manual
acceptance evidence. Hosted CI also checks PostgreSQL cases omitted locally.

The [midnight follow-up](android-native-midnight-2026-10-04.md) records actual
offline background rollover. Actual DST rollover, foreground midnight timing, native
modal disposal across account changes, iOS, reboot/Doze notification delivery,
institutional Canvas and a verified live campus feed remain separate gates.
