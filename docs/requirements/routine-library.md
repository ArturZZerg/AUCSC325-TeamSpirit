# Student routine library

Extends ToR 3.4 and 15: student-owned routines with simple completion, configurable
schedules, and lightweight non-medical wellbeing. **Browse routine ideas** opens
the library from Wellness and guided setup. Twelve curated starters cover Study,
Wellbeing and Everyday life; category filters, title/description search and clear
schedule previews help a student choose one small action.

Choosing a starter opens the existing Goal editor with an editable title,
category, account timezone, selected weekdays or weekly target. Only an explicit
save creates an ordinary Goal through `POST /goals`. No template entity, reminder,
completion, or automatic record is persisted. Existing goal editing ignores preset
defaults, preserving its own configuration. Flexible weekly targets remain
unscheduled daily work, following existing domain rules.

A normalized title match is an informational hint, including paused goals, with
a link to manage it in Wellness. Titles never become entity identity and records
are not merged or changed automatically. A successful addition is also remembered
within this visit so a failed subsequent refresh does not immediately offer the
same starter again. Edited titles remain ordinary user choices; the library is
not a cross-device uniqueness constraint.

The static idea catalog remains available offline. Existing goals use validated,
account-scoped query/cache reads; unavailable data is identified explicitly.
Failed writes retain the editable draft without showing success. Pending saves
block duplicate taps and dismissal. Session changes clear drafts, search,
filters and temporary addition markers; old callbacks cannot affect the new
screen. Pull-to-refresh and foreground resume refresh existing goal matches.

Evidence: `routines.test.tsx`, `routine-library.test.ts`, goal editor regressions,
and Wellness/setup navigation tests. Run root checks, Expo export, and narrow/wide
browser QA. Updated native device acceptance remains a separate gate.

Local verification on 2026-10-07: root checks passed with all 348 API tests using
isolated PostgreSQL, 555 mobile tests, 50 contract tests, 139 domain tests and
three Android build-script tests. Browser QA saved a weekday starter after
editing its weekdays and a flexible target after changing it to twice a week;
validated API reads confirmed both schedules, their account timezone, absent
reminders and correct Today membership. Saved records also appeared in Wellness.
The existing web device-reminder limitation was visible during QA. No authorized
ADB device was attached; native acceptance of these interactions is still open.
