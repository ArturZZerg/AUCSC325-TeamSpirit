# Android foreground and session lifecycle — 2026-10-04

These checks complete further Android acceptance on the same Pixel 10 Pro XL,
ARM64 APK and current local API identified by the preceding
[midnight](android-native-midnight-2026-10-04.md) and
[reminder](android-native-reminders-2026-10-04.md) reports. Development fixtures
were used throughout; application code and architecture were unchanged.

## Foreground midnight

A new native account used `Asia/Kathmandu`, whose October 4 day ended at
`2026-10-04T18:15:00Z`. Its three test tasks had an October 4 date-only deadline,
an October 5 date-only deadline and a timed deadline at that exact midnight.
Before the boundary, the native plan showed October 4 and the latter two tasks
in Coming up. API forwarding was removed at approximately `18:13:57Z`.

Today remained open across the real boundary. There was no app launch,
background/resume or selected-date navigation to cause this rollover. Observation
at approximately `18:15:40Z` showed Monday, October 5, both overdue tasks and the
October 5 date-only task in today's plan. The exact-midnight label remained
October 5 at 00:00 in the account zone, and the refresh-failure message was
visible. Android reported the app as its resumed activity and the phone awake;
the existing screen timeout was 30 minutes. Device time/settings were unchanged.

This complements the earlier real background-resume and cold-offline test.
It also exercises a zone with a 45-minute offset through the native runtime.

## Invalid session with an editor open

The previous disposable account opened a native New task modal with a private
unsaved title and duration 15. Only that test account's active sessions were
revoked in the local database to cause the normal authenticated API reads to
return 401 on resume. The native modal disappeared and authentication appeared.
This tests invalid-session handling; it does not simulate the passage of a
session's natural expiry interval.

Without restarting the app, registration of the next account and Add task opened
a blank title rather than the old private draft. The earlier reports also cover
ordinary offline sign-out, retained search/wellness drafts and account caches.

## Goal snooze and permission state

| Native check | Observed result |
| --- | --- |
| Snooze an active daily goal with an explicit future reminder from Today | Card became snoozed; API intent and one native alarm moved to `snoozedUntil`, while the original reminder configuration remained unchanged |
| Revoke only CampusFlow's notification permission | Existing native alarm remained pending before app launch |
| Cold-launch offline with permission denied | Cached reminder/preferences reconciliation canceled that alarm; count became zero |
| Use Settings to allow notifications again while offline | Android permission prompt appeared; granting permission restored exactly one schedule using validated cached intent/preferences |
| Restore API forwarding | Server still had the same active goal intent rather than a rewritten configuration |
| Sign out and remove the goal test fixture | Phone returned to authentication, no pending native alarms remained and the test account had no reminder intent |

Notification permission was restored to granted, matching its state before the
denial test, and localhost API forwarding was restored. Session revocation and
record changes were confined to disposable test accounts. No credentials or
private device notification contents are published in these reports.

## Remaining gates

Actual DST clock transitions, reboot/Doze/battery-saver delivery and iOS still
need platform evidence. A native iOS build/device is the next platform prerequisite.
Institutional Canvas authorization, a verified live campus feed and production
configuration remain external release gates. These Android results do not declare
the entire MVP or cross-platform release accepted.
