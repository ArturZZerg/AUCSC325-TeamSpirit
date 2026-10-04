# Android native reminder lifecycle — 2026-10-04

This follows the [offline/account/delivery acceptance](android-native-acceptance-2026-10-04.md)
on the same Pixel 10 Pro XL and the same recorded ARM64 APK. Disposable local
accounts and a private ICS fixture were used; this does not verify a live campus
feed or institutional Canvas.

## API build prerequisite

The initial lifecycle attempt reached an old API process started on October 3
before the reminder fixes. It retained intent after task completion even though
the current source removes it. The existing loopback API was restarted from the
validated current build with its original database configuration and data.
The corrected run removed both intent and alarm. Results below use that restarted
API; the stale-process attempt is not accepted as a current-code result.

For future native acceptance, build the current API and restart its process, or
use the README's watching development server. Rebuilding files alone does not
replace modules already loaded by a long-running Node process.

## Passed phone checks

| Action through the native UI | Observed result |
| --- | --- |
| Set task reminder for October 5 at 08:00 in `Pacific/Kiritimati` | API intent was October 4 at 18:00 UTC; exactly one CampusFlow native alarm |
| Complete task, then undo | Completion removed server intent and alarm, while retaining visible configuration; undo restored eligible intent |
| Fail a reminder edit offline | Editor retained October 5 and 08:10 with `Network request failed`; saved state remained unchanged |
| Replace with 08:10 and refresh repeatedly | One alarm for 18:10 UTC, with no old-time or duplicate alarm |
| Disable Personal reminders, then enable | Alarm count became zero, then scheduling resumed |
| Save quiet hours 08:00–08:30 in the account zone | One alarm moved from 18:10 to 18:30 UTC |
| Disable quiet hours and save | Alarm returned to 18:10 UTC |
| Snooze task one hour from Today | Intent and alarm moved to the snooze bound; the original 08:10 configuration remained visible |
| Remove task reminder | Refreshed card offered Set reminder and the native alarm count became zero |
| Confirm task deletion with another future reminder pending | Task list showed zero tasks and the native alarm count changed from one to zero |
| Set goal reminder in `America/Edmonton` while the account used `Pacific/Kiritimati` | Editor and card used the goal zone, separately from the account calendar |
| Pause goal, then resume | Paused configuration stayed visible with an inactive hint; alarm count changed from zero back to one |
| Complete weekly-target goal and open history | Progress changed from 0 to 1 toward target 3, with the Monday–Sunday week starting September 28; history recorded October 4 in the goal zone despite the account's October 5 date |
| Complete goal occurrence with a separate future reminder | That future reminder remained scheduled |
| Confirm goal deletion | Goal disappeared and its native alarm count became zero |
| Save private fixture event and set 08:45 account-local reminder | One saved-event intent at 18:45 UTC and one native alarm; provider event timing remained unchanged |
| Replace event reminder, add the event to the plan, then Remove saved with a new future intent pending | Refreshed event returned to Save event; alarm count changed from one to zero; the provider start/end stayed unchanged |

## Actual delivery

Separate near-term goal and saved-event reminders were verified with the app
backgrounded and local API forwarding removed. Android posted exactly one record
for each expected reminder ID, with the CampusFlow title and body. The event
requested for `17:33:00Z` posted at approximately `17:33:52.456Z`; the goal
requested for `17:33:31.680Z` posted at approximately `17:33:52.507Z` on October 4.
Together with the task notification in the first report, this demonstrates actual
delivery for all three explicit target kinds on this phone. Android used inexact
alarms; punctual delivery in other power states or devices remains unproved.

Alarm counts were inspected with Android's alarm service and compared with
authenticated `/reminders` responses after writes settled. Only CampusFlow
records were retained. An alarm is scheduling evidence; actual delivery is
recorded separately, with Android's inexact timing limitations.

## Remaining gates

Native task scheduling/recurrence/duration editors, goal schedule editing and
skip behavior, actual midnight rollover, native DST, iOS and reboot/Doze delivery
still require their own evidence. Reminder calculations remain behind the
existing service; no new delivery mechanism or offline-write design was added.
