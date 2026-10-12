# Current development state

Updated: 2026-10-12

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
PR #65 is merged after author review and both exact-head CI runs succeed
(`38207930701`, `38207927300`, head `cf7ac2a4c4578f6b858a848921afe4e011a3b390`).
Main is `45fc273054c74fcb61c9891e69befd4be9a128df`; post-merge CI
`38208267931` succeeds for that exact commit.

Wellness journal is implemented on `codex/wellness-journal` under ADR 012.
The current-day summary and native workspace use bounded, private account/range/
zone reads; 7/30-day reflection, optional tap ratings, saved entry editing and
deletion, note/date search and historical browsing are implemented. Additive
migration 12 supplies revision checks. Legacy creation cannot silently replace
a saved day. User-first locks protect erasure; failed/uncertain edits retain
reviewed versions and drafts, with explicit reconciliation/review and local
cache cleanup retry. Native Android/iOS remains first; the workspace keeps five
tabs and uses existing moss/sage primitives without a new dependency.
Final root lint/boundaries/schema/types/tests/build passes: 621 API, 922 mobile,
135 contracts, 173 domain, 3 Android-script and 20 release/dependency tests
(1,874 total). The journal adds eight real PostgreSQL and fifteen contract tests,
with editor, reflection, cache, screen and retained-tab regressions. An existing
reminder test timed out during a competing native build; the complete idle rerun
passes without modifying that test or its timeout.
Two actual mail-disabled loopback API processes verify owned private ranges,
one-winner concurrent create/edit, stale/cross-owner protection, legacy conflict,
future/range validation, note-only save/delete, compatible export and owned
erasure. Actual restore preserves 23 tables/199 synthetic records, including the
revision-2 journal entry, and verifies schema/readiness before removing its
disposable database. The source is preserved.
An isolated copy of the actual journal/editor with public in-memory sample data
verifies saved prefills, rating selection, save/reflection update, dirty cancel,
note search, delete review/cancel, empty historical browsing and blank defaults.
Geometry at 320/375/430/1024px has no page overflow, with 46px actions and 68px
rating controls. Review adds supported ARIA aliases for selected states and modal
background hiding; period labels remain accurate for historical windows.
Screenshot capture is unavailable. These fixture interactions do not claim real
browser credential submission or hardware acceptance; its tab/viewport are closed
and reset. The fixture source never replaces production application files.
Fresh Android/web artifacts include the reviewed journal and selected origins,
exclude private credentials and public fixture data, and pass native ASCII/UTF16
and HTML-referenced entry scans. Native v2 signature and real API/web entry/three
asset/SQLite isolation smoke pass. Preview APK SHA-256:
`3BAC903B4416FEED6C46D9F07382A00619DAFF3291AAB8F1D0569790BB83F838`.
At journal delivery ADB had no attached device. PR #66 is merged after author
self-review and both exact-head CI runs succeed (`38213528662`, `38213523241`,
head `929380a7351efc82c337bfcc23f2d13837bd1b88`). Main is
`90da612a57445a50f991f31e567993dca74a1f87`; post-merge CI `38213916245`
succeeds for that exact commit. Production is not claimed ready.

The next release slice is `codex/router-release-checks`: eight installed SDK 55
Router parser/serializer acceptance checks with a throwing old-decoder canary.
Actual account/focus links retain task identity and Unicode query data; bounded
malformed encodings and an unknown segment round-trip without reaching that
decoder, and prototype-shaped query data does not change object prototypes.
The targeted suite passes. No runtime/dependency/native-build change is made.
Router 55.0.18 is the latest SDK 55 patch checked on 2026-10-12. The decoder's
patched ESM package and current CommonJS parent are incompatible; no forced
override is used. Full/omit-dev audits remain 0/45/15/60 and 0/41/15/56
(critical/high/moderate/affected entries). These checks do not patch the bundle,
prove every link safe or establish native acceptance. Full root lint, boundaries,
schema, types, tests and build pass: 621 API, 930 mobile, 135 contracts, 173 domain,
3 Android-script and 20 release/dependency tests (1,882 total). The final canary
also explicitly rejects invocation even if a caller catches its thrown error.
The targeted final suite and lint are rerun after that assertion. PR #67 is
merged after author self-review and both exact-head CI runs succeed
(`38292274399`, `38292267141`, head `2c782d61e61badce057705464df2bc848b277356`).
Main is `10d37fdfbc7282abf6b99921c9a916f107ab7c17`; post-merge CI
`38293048776` succeeds for that exact commit.

The owner authorized existing-server hosting and offered a connected Android
device on 2026-10-12. Read-only discovery verifies the existing server at
95.217.239.38 runs Nginx/PostgreSQL and other live applications. An isolated
CampusFlow HTTPS deployment and actual device acceptance are the next delivery
work; SMTP/provider approval is still absent, so public signup stays closed.

The current `codex/vps-native-beta` slice prepares ADR 013, a pinned Node 22
production image, bounded non-root read-only Compose runtime, isolated Nginx path
and container CI readiness gate. Shared account admission now defaults to socket
identity, with explicit loopback-only forwarding that validates one IP and rejects
ambiguous/public startup binds. Twenty-five new API tests include real HTTP
controller checks. Full root lint/boundaries/schema/types/tests/build passes
1,907 tests (646 API, 930 mobile, 135 contracts, 173 domain, 3 Android-script,
20 release/dependency). Both local image targets build; all twelve migrations
apply to a disposable PostgreSQL 17 database. Fifteen actual production-container
HTTP requests verify readiness, closed signup, anonymous rejection, owned login,
tasks/Today, revisioned journal and private export. Restore preserves 23 tables/
23 synthetic records and removes only its generated disposable database.

Automatic approval review rejected a prepared private source upload. The owner
then explicitly chose to keep source local: no archive/source was uploaded,
and no CampusFlow server database, service or route was installed. Any locally
built runtime image contains readable compiled JavaScript and needs separate
explicit transfer approval. Existing server applications remain untouched.

The supplied Pixel 10 Pro XL/Android 16 is unlocked. A new v2-signed preview
installs with app data retained. Actual sign-in revealed a stale native API:
changing only EXPO_PUBLIC_API_URL left the old HTTPS bundle in the local APK.
The native workflow now reruns only the bundle task; Metro partitions transforms
by the selected API because Expo suppresses reset-cache under CI. Actual rebuilt
APK inspection verifies local API/current journal, excludes the previous HTTPS
API and private QA credentials, and passes v2 signature verification (SHA-256
`3BAC903B4416FEED6C46D9F07382A00619DAFF3291AAB8F1D0569790BB83F838`).
The workflow also refuses to copy a preview whose generated Hermes output lacks
the selected URL. Actual ordinary native login/Today, task creation with estimate/
date-only deadline, and journal editing reach PostgreSQL; optional stress stays
blank and the journal advances to revision 5. Offline/lifecycle acceptance is in
progress. Device inspection finds the standalone journal header under Android's
status bar; standalone screen insets are the next separate slice. No new native
notification delivery, independent hosting, SMTP, iOS or store acceptance is claimed.

PR #68 is merged after author self-review and both exact-head CI runs succeed
(`38298183175`, `38298176635`, head `8e73ebecd2e51f82f1bf781d3658f0696f8a913d`).
Main is `87b4757b43e6abe0e1159ad42d325e79fa31e696`; post-merge CI
`38298828460` succeeds for that exact commit. Disconnected cold Today and journal
reads are now observed with explicit saved/stale messaging and the edited entry.

The next slice, `codex/native-screen-insets`, adds an explicit safe-area opt-in
for twelve standalone workspaces using the installed library. Tabs retain their
navigation chrome and existing account/auth/modal safe areas remain separate.
The physical geometry regression detects the old journal viewport crossing both
system bars. The fresh inset APK builds, includes the selected local API and
passes v2 signing (SHA-256
`4723EE77F9D31AC8977F4B558BD07CE5892EA989CF4D0287DDD7AEDAA636BD73`).
Full root checks pass all 1,907 tests with the established isolated database.
An initial run against the live Docker acceptance database has twelve mail-fixture
failures; all 930 mobile tests pass and isolated-database mail tests pass.
No mail-worker change or delivery claim follows from that run.
The Pixel disconnects before the corrected APK can be installed. Reconnection
is requested for twelve-screen geometry/reminder acceptance and restoration of
its temporary keep-awake preference. See the 2026-10-12 native acceptance report.

Release gates: apply all required migrations to the approved deployment,
enable reviewed campus calendars for the intended campus;
verify new native lifecycle/touch flows; retain live Canvas,
hosting/TLS and production account-recovery gates from the MVP roadmap.

### Production API runtime dependencies, 2026-10-12

PR #69 is merged after author self-review and both exact-head CI checks succeed;
main `60fecc6e1075dfc030a7cd5b1c0bf957fbf74158` has successful post-merge CI
`38300447789`. The Pixel remains disconnected; new-build inset, reminder and
keep-awake restoration acceptance is still pending. Source remains local.

The next slice, `codex/api-runtime-dependencies`, addresses actual production
packaging: workspace-filtered pruning retained 438 packages, including Jest,
Prisma CLI, braces and sprintf-js. Restricting only the disposable stage's
workspaces and applying unfiltered dev/optional/peer pruning reduces this to
106 packages and cuts image size about 33%. The migration build target and
generated query engine remain available; committed workspace/version/lockfile
contracts are unchanged. CI inventories actual runtime files without network,
checks compiled/dependency entries and rejects reviewed tools/source leakage.
Five regression tests pass; the old image fails 45 policy checks and the new
image passes. Sixteen real HTTP checks pass with a separate synthetic owner;
23-table/30-record restore preserves the source and original Pixel owner.
Full root lint/boundary/schema/type/test/build checks pass all 1,912 tests.
Both image targets build, the migrator retains Prisma 6.19.0, and every installed
runtime version matches the unchanged root lockfile. Exact-head PR/main CI is
required before merge. Remaining mobile/build advisories, physical device,
hosting/mail/iOS/store gates persist.
