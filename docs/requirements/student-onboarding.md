# Guided student setup

Extends ToR 4 (daily plan), 7 (personal tasks), 15 (routines), and 19 (cached
account data). Today opens **Get started**; an empty daily plan also offers an
actionable invitation. The guide stays optional and available to existing users.

Three foundations track actual saved tasks, non-fixture coursework, and goals.
Visiting a screen or cancelling a form never marks a step complete. Progress
survives app restarts through the existing authoritative account records. Demo
Canvas records do not count as student coursework. Missing reads display
**Not loaded**, while cached records remain usable with a refresh notice.

Students create a task scheduled for their current account date, add manual
coursework without Canvas, and configure a daily/weekly routine through existing
validated editors. Weekly planning and focus shortcuts complete the introduction.
No sample records, reminders, subscriptions or connections are created implicitly.
All saves require the API; failures preserve drafts and do not advance progress.
Session changes remount the guide and dismiss private forms. Foreground resume
and pull-to-refresh reload account reads. There is no onboarding database entity,
new dependency, or change to authentication/Canvas architecture.

Evidence: `get-started.test.tsx`, Today entry tests, and existing editor tests.
Run root checks and Expo web export; inspect narrow/wide layouts and creation
flows. Native keyboard, accessibility and touch flows remain device gates.

Local verification on 2026-10-07: root checks passed (526 mobile, 50 contract,
139 domain and three Android build-script tests); all 348 API tests also passed
against isolated PostgreSQL. Browser QA on the current API saved a scheduled
task, manual coursework and a routine, advancing progress from 0 to 3. Layouts
were checked at 320px, 390px and 1100px without horizontal overflow. The existing
device-reminder service reports its web limitation; native reminder behavior was
not exercised. Temporary QA entries and credentials were removed from the app
before production web export and commit.
