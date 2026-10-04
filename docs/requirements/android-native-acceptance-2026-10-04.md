# Android native acceptance — 2026-10-04

Result: the offline-date, account-switching and background reminder-delivery
checks below passed on a connected Pixel 10 Pro XL (ARM64). This is targeted
acceptance evidence, not completion of the entire Android checklist or iOS gate.

## Tested build and environment

- Source commit: `2622539050933665aea74a5186a6d3920f81f506` (through PR #33).
- APK SHA-256: `b157352c9d42043ef8a28765cf46907c43acc557e55426d14c56c3f563d25d8e`.
- Locally signed release APK, installed with `adb install -r`; bundled JavaScript,
  with no Metro or Expo Go.
- Local NestJS API and PostgreSQL; API reached through
  `adb reverse tcp:3000 tcp:3000`. Removing this forwarding made the bundled
  `http://localhost:3000` API unavailable without changing the phone's network.
- Two isolated development accounts, using `America/Edmonton` and
  `Pacific/Kiritimati`. Records were seeded through authenticated local REST
  requests; navigation, permission, drafts, sign-in/out and failed writes were
  exercised on the phone using Android's UI hierarchy and input commands.

No credentials, session tokens, personal notification contents or device serials
are included in this report. Maestro was not used; its registration smoke flow
does not establish the following acceptance results.

## Observed results

| Check | Phone evidence | Result |
| --- | --- | --- |
| Fresh Today | First account displayed its October 4 task, daily routine and October 5 upcoming task | Pass |
| Offline new date | Without API forwarding, `campusflow://today?date=2026-10-05` displayed the next day's task and routine from the previously captured snapshot | Pass |
| Cold offline launch | Force-stop and launch with that date restored the session and SQLite plan, with the refresh-failure message | Pass |
| Uncovered date | `campusflow://today?date=2026-11-04` showed the selected heading and refresh failure, without old cards or a confirmed-empty message | Pass |
| Offline write | Tapping Complete produced `Network request failed`; the original task remained incomplete with retry available | Pass |
| Permission | Settings opened Android's notification prompt; Allow granted permission | Pass |
| Background delivery offline | One pending CampusFlow RTC alarm produced one posted notification while the app was backgrounded and API forwarding was absent | Pass |
| Offline logout cleanup | With a separate future reminder pending, Sign out returned to authentication and the count of pending CampusFlow RTC alarms went from one to zero | Pass |
| Account calendar and records | Second account displayed October 5 in its own timezone and only its own distinct task | Pass |
| Retained tab state | First account's task search and unsaved wellness mood/note did not appear in the second account; search was blank, mood reset to 3 and note was blank | Pass |
| Second-account cold offline launch | Restored only the second account's task and its October 5 heading | Pass |
| Signed-out restart | After offline sign-out, force-stop/relaunch showed authentication rather than either account's cached plan | Pass |

The reminder requested for `2026-10-04T17:10:15.251Z` was posted by Android at
approximately `2026-10-04T17:11:02.048Z`. Its notification record had the expected
CampusFlow stable identity, title `CampusFlow reminder` and body
`Something in your plan is coming up.` Android reported an inexact alarm window;
this proves delivery in this run, not exact-second delivery or reliability in
Doze, battery saver, after reboot or across every device.

## Repeat the targeted checks

Use the [preview guide](android-preview.md) to install the tested build and
connect the local API. Create disposable accounts in two different IANA zones
and give each a distinct task. Populate the first account's Today snapshot with
a task due tomorrow and a daily goal, then remove API forwarding:

```powershell
& $adb -s DEVICE_SERIAL reverse --remove tcp:3000
& $adb -s DEVICE_SERIAL shell am start -a android.intent.action.VIEW -d 'campusflow://today?date=YYYY-MM-DD' -p com.campusflow.mobile
```

Choose a never-opened date inside the saved eight-day coverage, cold-launch that
date, and then choose a date outside coverage. Verify actual cards and failures,
not just the heading. Restore forwarding for sign-in and configuration; remove
it again for offline logout and cached reading. Use Settings to grant permission
and refresh a future explicit reminder, background the app, and verify its posted
notification. A scheduled alarm alone is insufficient delivery evidence.

Leave a future reminder pending and fill task-search/wellness drafts before
offline sign-out. Verify alarm cancellation, sign into the other account, inspect
each retained tab, and cold-launch offline. Finish signed out and restore API
forwarding.

## Remaining acceptance

The [reminder lifecycle follow-up](android-native-reminders-2026-10-04.md) records
additional native controls. Next, exercise the remaining task/goal editors.
Real midnight rollover, native DST behavior,
iOS, reboot/Doze delivery, live institutional Canvas and a verified campus feed
remain unproved. Automated tests and fixture data do not close those gates.
