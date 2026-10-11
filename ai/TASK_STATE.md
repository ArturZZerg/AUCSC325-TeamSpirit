# Current development state

Updated: 2026-10-10

Goal: extend the MVP with complete student workflows, preserving the accepted
architecture and five-tab navigation, through validated PR/review/merge cycles.

Completed:

- Recorded focus sessions and account-scoped history: PR #55 merged. ADR 006
  defines ownership, explicit saving, retry identity and retained task context.
- Weekly study report: PR #56 merged; derived time by day/task, total estimates for comparison,
  direct focus actions, validated cached coverage and honest unavailable states.
  No new dependency or persistence is added by the report.
- Focus device recovery: validated account-scoped checkpoints, explicit paused
  recovery, identical failed-save retries, Today recovery card and guarded cleanup
  on sign-out/fresh login. ADR 007 replaces the transient termination policy.
- Live campus discovery: verified public Augustana recreation and Thursday Night
  Breakout calendars, hourly backend imports, persisted successful coverage,
  replica-safe refresh throttling and failed-import preservation under ADR 008.
  Campus has 7/30-day and saved views, local date groups, location search,
  organiser details/links and source freshness that ages while open.

Validation: root lint/typecheck/test/build with disposable PostgreSQL; dedicated
API, timer, cache, report and interaction tests; production web export; real-API
browser checks at 320/390/1100px, including save/read, task targeting and failed
refresh preservation. Native phone interaction remains a separate acceptance gate.

Focus recovery validation: 391 API, 737 mobile, 87 contract, 173 domain and 3
Android build-script tests; root lint/typecheck/build and clean web export passed.
Browser checks used real SQLite/PostgreSQL at 320/390/1100px: restart restored
paused progress, Today linked to the exact block, resume excluded time away, and
a server-success/lost-response restart retry produced exactly one 44-second
history record. ADB listed no attached device; native process-kill is unverified.

Campus validation: 408 API, 751 mobile, 94 contract, 173 domain and 3 Android
build-script tests; root lint/typecheck/build and production web export passed.
Live source requests returned complete batches. PostgreSQL/API/SQLite browser QA
at 320/390/1100px verified real event save, plan inclusion, chosen reminder,
source provenance, search/range controls and preservation after API failure.
Focus recovery preview APK built and its signature verified; no ADB device attached.

Workload inbox: Today/planner entry points, actionable attention/unscheduled/
coursework/today/later groups, search, exact task focus/edit and targeted study
plans. Known archived/finished plans stay linked; uncertain reads withhold new
preparation creation. Existing editors retain pending/failure/retry behavior.
No new schema, service or dependency. See the workload requirements for tests.
Existing focus blocks retain their current task when another is requested; the
requested task stays visible and becomes an explicit choice after saving.

Workload validation: 408 API, 782 mobile, 94 contract, 173 domain and 3 Android
build-script tests passed with root lint/typecheck/build and production web export.
Real PostgreSQL/API/SQLite browser QA confirmed selected task rescheduling without
deadline changes, one reviewed plan with exactly three linked sessions, targeted
plan expansion and an explicit focus handoff preserving the previous block.
Saved workload survived API failure and refreshed after recovery. Responsive
checks at 320/390/1100px found no overflowing controls. Native acceptance is pending.
An account-switch regression also verifies that a delayed preparation save cannot
navigate the newly signed-in account after its private editor has unmounted.

Next recommended feature: an account/privacy centre with personal data export
and authenticated whole-account deletion, followed by verified account recovery
once the production email service and deployment target are provided.

Release gates: apply FocusSession and CampusFeedState migrations to deployment,
enable reviewed campus calendars for the intended campus;
verify new native lifecycle/touch flows; retain live Canvas,
hosting/TLS and production account-recovery gates from the MVP roadmap.
