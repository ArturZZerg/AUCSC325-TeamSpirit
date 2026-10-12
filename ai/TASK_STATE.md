# Current development state

Updated: 2026-10-11

Goal: extend the MVP with complete student workflows, preserving the accepted
architecture and five-tab navigation, through validated PR/review/merge cycles.
Release priority remains native Android/iOS first, confirmed by the user after
considering PWA delivery. Retain web for verification; PWA installation can follow
without changing the native release priority.

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
Web builds now clear Metro's cache: artifact inspection reproduced a stale QA
API origin after an environment change. A fresh export and the final Android
bundle were checked for the selected preview origin and absence of QA credentials.

Account & privacy: Settings workspace with full server-saved export review and
JSON download/native file sharing, password-confirmed atomic account deletion,
all-session revocation, private-import owner locks and attempt-all local cleanup
with retry. Web sign-in uses memory-only storage and returns directly to the
account resource after real sign-in. Neither lost replies nor expired sessions
are treated as deletion confirmation. No schema migration or service was added;
Expo file/share modules satisfy the native JSON file requirement.

Account validation: full disposable-user graph export/deletion, another-user and
public-event preservation, wrong-password bounds, rollback and both private-import
race orders; mobile pending/failure/late-owner behavior, platform adapters and
cleanup retry. Real PostgreSQL/API/browser QA verified ordinary sign-in, safe
continuation, reload sign-out, an actual validated JSON download and deletion
review/cancel at 320/390/1100px. Permanent deletion was executed only by disposable
API tests. Native file/share and production-hosted self-service remain gates.
Final reviewed gates: 417 API, 802 mobile, 97 contract, 173 domain and 3 Android
build-script tests (1,492 total), lint/boundaries/types and builds. The review also
covered concurrent task/routine/saved-event reminder edits during deletion.
Destructive-button text now has 5.70:1 contrast on the existing shared primitive.
Fresh web/Android bundles exclude synthetic QA credentials and loopback QA origins.

Next recommended task: verified account recovery with production delivery
disabled until the owner configures the chosen transactional email service,
followed by hosted deployment and device acceptance. Keep each release gate
separate from local app, preview and CI evidence.

Release operations implemented: bounded read-only liveness/schema/migration
readiness, explicit production database/CORS/fixture configuration, graceful
shutdown, generated schema-manifest freshness gate, and GET-only release smoke
that validates identity/daily data and actual Expo entry/worker/WASM assets.
Guarded snapshot-consistent pg_dump/pg_restore compares every application table,
migration record, constraints and indexes; cleanup targets only its generated
disposable database. Source test database remains intact. CI restores its own
isolated service database using clients inside that same service container.

Local PostgreSQL 18.4 + official 18.6 clients verified 19 tables/163 records with
identical restored content/relationships and readiness; fresh loopback web smoke
passed health/CORS, synthetic identity/data and three actual referenced assets.
Root lint/boundaries/types/tests/build and fresh web export passed; final reviewed
tests/config changes also run through exact-commit CI before merge. These checks
do not establish hosted production backup policy/RPO/RTO, delivery, capacity,
native acceptance or signing. Next: implement account recovery with delivery
disabled until the owner chooses and verifies the production mail provider.

Dependency release repair: compatible Nest/Multer, shell-quote, source-map-js and
Handlebars patches, plus scoped Prisma configuration deepmerge/effect fixes.
The unchanged Prisma 6.19 CLI moves to root dev tooling so npm workspace links
cannot discard its overrides; schema/client/database modules remain in the API.
Clean installation, explicit generation/migration, 1,551 tests and complete root
checks passed. Fresh web/API smoke, 19-table/163-record source-preserving restore
and signed Android preview verification passed; no Android device is attached.
Full audit affected entries: 69 → 60; omit-dev: 64 → 56; both zero critical.
Five unresolved leaf advisories remain tracked with actual usage in
`docs/development/dependency-safety.md`; no forced SDK downgrade or suppression.
PR #62 merged after author self-review and both exact-head Linux CI checks passed.

Account recovery is the active next feature on `codex/account-recovery` under
ADR 009. Build the real request/reset UI and transactional credential/session
lifecycle, with private encrypted PostgreSQL mail envelopes and shared rate
buckets in the existing API. Delivery stays disabled until the approved provider
is configured; real sender delivery and registration email verification remain
public-onboarding gates. No recovery UI/provider acceptance is claimed yet.

Recovery foundation verified: shared strict input/acknowledgment contracts;
120-bit grouped codes and AES-GCM envelopes with message-ID binding; explicit
disabled/SMTP/TLS configuration; three private tables in migration 9 and updated
readiness manifest; atomic source/global/recipient quotas across instances; and
account-export exclusion plus linked/unbound mail/recipient quota erasure.
Full `npm run check` passes 1,614 tests (507 API, 802 mobile, 109 contracts,
173 domain, 3 Android script, 20 release/dependency). Real restore matches
22 tables/164 records, preserves the source and removes only its disposable target.
The delivery worker, transactional reset/sign-in serialization, controller
capabilities and native/web recovery screen are not implemented yet. Complete
those and end-to-end acceptance before creating the recovery feature PR.
Nodemailer registry 10.1.0 supports Node >=20 and includes its own TypeScript
declarations; it is not installed yet. Use certificate-verified SMTP, a captured
test delivery port and no real recipients during development.

Release gates: apply FocusSession and CampusFeedState migrations to deployment,
enable reviewed campus calendars for the intended campus;
verify new native lifecycle/touch flows; retain live Canvas,
hosting/TLS and production account-recovery gates from the MVP roadmap.
