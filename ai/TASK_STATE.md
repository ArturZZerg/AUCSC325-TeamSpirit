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

Next recommended task: registration email verification for public onboarding,
with production mail disabled until the approved service is configured,
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

Account recovery merged as PR #63 under ADR 009 after author self-review and
both exact-head CI checks passed for `13d4c33ea5aac7276fa236bf644cbb48a1d13aca`.
Main merge commit is `ea30b2f56cb4a5e77a6e598235c5d13ec1cfa33d`.
Request/reset UI and transactional credential/session lifecycle use private
encrypted PostgreSQL mail envelopes and shared rate buckets in the existing API.
Delivery stays disabled until the approved provider is configured; real sender
delivery and registration email verification remain public-onboarding gates.

Recovery foundation verified: shared strict input/acknowledgment contracts;
120-bit grouped codes and AES-GCM envelopes with message-ID binding; explicit
disabled/SMTP/TLS configuration; three private tables in migration 9 and updated
readiness manifest; atomic source/global/recipient quotas across instances; and
account-export exclusion plus linked/unbound mail/recipient quota erasure.
Full `npm run check` passes 1,614 tests (507 API, 802 mobile, 109 contracts,
173 domain, 3 Android script, 20 release/dependency). Real restore matches
22 tables/164 records, preserves the source and removes only its disposable target.
Recovery completion: private capability/request/reset endpoints, durable worker
with bounded encrypted retries and fenced leases, certificate-verified SMTP,
atomic salted password update/all-session revocation/code invalidation/notice,
and sign-in serialization on the User lock. Explicit UTC SQL fixes non-UTC
PostgreSQL session comparisons; Auckland/Denver evidence covers the regression.
Nodemailer 10.1.0 is the only new API dependency and supplies its own types.
Audit counts remain 60 full / 56 omit-dev affected entries with no critical
entries; no Nodemailer advisory was reported. Five prior leaf risks remain.

The native recovery screen reuses Field/Button and moss/sage tokens, preserves
only the supported account return, validates pasted codes and confirmed passwords,
retains failed drafts, blocks duplicate submissions/dismissal, uses a resend
cooldown and discards late replies after unmount/sign-in. Drafts stay in memory.
The retained sign-in screen clears its password before opening recovery.
Full root checks pass 1,676 tests (547 API, 824 mobile, 109 contracts, 173 domain,
3 Android script, 20 release/dependency). Browser request/acknowledgment and code
layout/validation pass at 320/390/1100px with 46px targets and no overflow.
Password-change completion is verified separately by disposable API/native
component tests; browser credential-change submission is not claimed.
21st catalog search requires authentication; automatic approval review rejected
21st review because of possible private source egress. Local review/checks and
browser evidence provide the UI verification instead. See the recovery runbook.

Final recovery acceptance: fresh web and Android exports passed, preview APK v2
signature verified, and native bundle origin/privacy scan passed. APK SHA-256 is
`26C72795DCEA2058CDF27A328A7B7DEAF4608C4473BEC14FA9B108D93CF263E6`.
ADB lists no attached device. Real loopback API/web smoke verifies health/CORS,
authorized daily reads and actual entry/worker/WASM assets with SQLite isolation.
The running API also completes a captured-delivery request/reset, rejects the old
token/password and reused code, and retains the synthetic owner's task. This
does not prove real SMTP or browser/native password-change submission.
Final PostgreSQL restore matches 22 tables/201 synthetic records, preserves the
source and removes only the generated disposable restore. Review fixes also
prove nonblocking cleanup and real Nest worker-drain-before-Prisma shutdown.

Email verification is implemented on `codex/email-verification`, under ADR 010.
Public signup/login with an unverified mailbox issues no access session.
Password-and-code proof is single-use, credential-bound and atomic; verification
revokes old preview sessions, then requires ordinary sign-in. Preview users are
not silently marked verified. Recovery/reset/delete, separate token purposes,
encrypted retry/fencing and private export behavior preserve student data.
Production defaults to closed signup; verified mode requires complete SMTP.
Native forms handle capabilities, verification-required results, resend limits,
failed drafts, pending controls, safe account return and late/owner changes.

Final root checks: 588 API, 855 mobile, 120 contract, 173 domain, 3 Android-script
and 20 release/dependency tests pass (1,759 total), with lint/types/build. A running
loopback API verifies actual captured-mail signup, password/code proof, replay and
cross-purpose rejection, ordinary login and owned task creation. Fresh Android
and web exports, v2 signature, chosen native origin/privacy and actual web asset/
SQLite/API smoke pass. Preview APK SHA-256:
`75B03DAEC7160B1F0287577C6EF0A6228FE3309C9D77B0C5579A7DC6F00CC6AE`.
Actual restore preserves 23 tables/194 synthetic records, including a live private
verification token, and removes only the generated disposable database.
Browser geometry/empty validation/account continuation passes at 320/390/1100px,
with 46px controls. Browser screenshot capture is unavailable; no visual image or
browser verification submission is claimed. ADB has no attached device. Real SMTP,
hosted production, native phone/iOS and store acceptance remain unverified.
PR #64 is merged after author self-review and both exact-head CI runs succeeded
(`38203462253`, `38203458166`, head `d2ab66ee9a6c8795b7155d0843fb5703eed1b05f`).
Main is `fa38abc1d484fe92c90be68dbc9d981819b76ee0`; production mail stays off.
Post-merge main CI `38203755144` also succeeds for that exact commit.

Account access lifecycle is implemented on `codex/account-access-lifecycle`
under ADR 011. Startup/foreground private access checks and still-current 401
handling return to ordinary sign-in through attempt-all cleanup/retry. Offline,
timeout, unavailable/malformed reads and obsolete owner/token replies preserve
the appropriate session/cache. Production requires independent stable
`AUTH_RATE_KEY`; shared source/recipient/global login and owned password quotas
remain active with mail disabled. Admission commits before password/mutation
transactions; User-first locks, fresh credential checks and cascade erasure avoid
late owned metadata and nested transactions. Migration 11 is additive.

Full root lint/types/tests/build passes: 613 API, 880 mobile, 120 contracts,
173 domain, 3 Android-script and 20 release/dependency tests (1,809 total).
Author review reproduced a cancelled cached-query 401 clearing an active session.
The regression fails before the fix and passes after removing duplicate query
read/mutation sign-out handling; the shared API owner/token/abort boundary now
owns rejection cleanup and preserves the reauthentication notice. Targeted
query/access checks pass 53 tests, followed by the full root check.
Two actual mail-disabled loopback API processes share quotas, reject revoked/
expired tokens and retain the synthetic owner's saved task after ordinary login.
Actual restore preserves 23 tables/202 synthetic records, including live owned
quota data, matches constraints/indexes/readiness and removes its disposable DB.
Fresh Android/web artifacts, native ASCII/UTF16 and private-QA scans, v2 signature
and real web entry/worker/WASM/API/SQLite-isolation smoke pass. Preview APK SHA-256:
`C35C02A05BAF40EBEDE0AA9D65CE6D263CCABF7358C434B87B846CD2BA7635C7`.
The reviewed rebuild uses the short Windows Gradle cache. Changing cache roots
also required refreshing only ignored app/Expo/screens CMake state containing
old long header paths; the final native release build succeeds.
Browser verifies the actual account continuation and closed-signup state at
1280px without overflow and with 46px controls; its temporary tab is closed.
No browser credential submission or device session acceptance is claimed.
ADB has no attached device. Screenshot capability remains unavailable.
PR #65 is open. Author review and final native/web artifact acceptance pass;
the reviewed fix still needs exact-head CI and merge before delivery is complete.

Next substantial product candidate: complete the Wellness check-in journal with
saved-today editing, clear mood/energy/stress choices and useful bounded history
and reflection, preserving private notes, partial/offline coverage and account
guards. Inspect the existing Wellness entities/queries before choosing scope.

Release gates: apply FocusSession and CampusFeedState migrations to deployment,
enable reviewed campus calendars for the intended campus;
verify new native lifecycle/touch flows; retain live Canvas,
hosting/TLS and production account-recovery gates from the MVP roadmap.
