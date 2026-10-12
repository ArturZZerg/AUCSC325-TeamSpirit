# CampusFlow release evidence and remaining gates

This is a technical readiness record, not a claim that the current build is ready
for store submission.

| Area | Confirmed evidence | Required before production |
| --- | --- | --- |
| Daily workflow | Tasks, Today, planner, classes, preparation, focus/history/report, routines, wellness, campus discovery and workload inbox; automated behavior tests and real API/cache browser checks | Full acceptance script on authorized Android and iOS devices, including keyboard, accessibility, lifecycle and offline cold start |
| Account privacy | Password-confirmed whole-account deletion, complete versioned export, private-import race protection, attempt-all cleanup/retry, ordinary web sign-in and actual JSON download verified; ADR 011 adds owned shared password admission with rollback/erasure protection | Authorized native share/cleanup acceptance, hosted HTTPS `/account` resource, declared backup/log retention and deployed abuse monitoring |
| Account recovery | Request/reset, encrypted durable mail, shared quotas, single-use/expiry/rollback and sign-in/reset session races verified with disposable PostgreSQL; native recovery UI states and narrow/wide browser request layout verified under ADR 009 | Approved SMTP sender/provider and real delivery, deployed trusted proxy/source policy, signed-device acceptance |
| Public signup | ADR 010 adds password-and-code mailbox verification, private purpose/credential-bound tokens, public session gating, explicit preview/verified/closed modes and native verification forms; ADR 011 adds mail-independent shared auth limits and native recovery from confirmed session rejection while preserving offline reads | Approved real mail delivery, deployed auth key/source policy, signed-device acceptance and abuse/capacity monitoring |
| Backend hosting | NestJS/PostgreSQL, bounded read-only schema/migration readiness, production configuration validation, actual local smoke and snapshot-consistent restore rehearsal; CI also restores its disposable DB | Authorized production project/secrets, real migration/backup/restore policy and host rehearsal, TLS, health monitoring, capacity and availability checks |
| Dependencies | Reviewed compatible patches, effective scoped Prisma CLI overrides, clean install and real CLI/app/build/smoke/restore verification; both audit reports have zero critical entries | Five unresolved leaf advisories and their actual runtime/bundle paths need supported upstream fixes or explicit reviewed release disposition; see the dependency evidence record |
| Canvas | Normalized fixture integration and idempotency tests; production OAuth is disabled | Institution-approved key/scopes/callback, protected token storage and authorized live sync/revocation test |
| Public campus events | Reviewed Augustana calendars, persisted feed coverage, replica-safe imports and failure preservation | Intended campus approval/configuration and observed successful imports on the deployed API |
| Notifications | Server intent, local reconciliation and behavioral tests | Device permission, edit/delete/reschedule, quiet hours and duplicate-prevention acceptance; offline/other-device limitations accurately disclosed |
| Mobile builds | Locally signed Android preview, signature checks; no synthetic QA credentials in package; reviewed permission removal and actual APK inventory gate | Production signing/identifiers, store builds, installation/backend connectivity and signed-device acceptance of session/cache/share/reminders after permission removal; older Android and iOS build/signing on supported host |
| Web artifacts | Reproduced Metro environment-cache issue; build now clears cache; fresh referenced entry and packaged bundles inspected | Fresh deployment output with authorized HTTPS API/domain; validate actual hosted assets and avoid publishing old generated bundles |
| Privacy/support/store | Technical data ownership/lifecycle and public offline Help are documented; searchable workflow/data answers, protected account continuation and configurable validated policy/support links | Owner-approved public privacy/support URLs, real backup/log retention and accurate Apple/Google data declarations; native Help/browser acceptance, store metadata/review account |

On 2026-10-12 the owner authorized the existing server for initial hosting and
offered an Android device. Read-only discovery verifies the existing server,
its valid HTTPS and other running applications. The owner subsequently chose
to keep source local; no CampusFlow source, service, database or HTTPS route is
deployed there. ADR 013 and the [server beta runbook](server-beta.md) document
prepared containers and loopback source quotas. Both local image targets build;
all twelve migrations apply, fifteen authenticated/anonymous HTTP checks pass,
and the local container database restores 23 tables/23 synthetic records with
source preservation. The unlocked Pixel accepts the signed preview; current
device testing found a stale API bundle, addressed by regenerating the bundle
and partitioning Metro transforms by API. Actual native login/Today, task creation
and revisioned journal editing reach the local production container/PostgreSQL.
Disconnected cold Today/journal reads restore with saved/stale messaging. The
standalone inset fix builds and its hardware regression detects the old journal's
bar overlap, but new-build geometry awaits device reconnection. See the
[native acceptance report](../requirements/android-native-acceptance-2026-10-12.md).
Hosted deployment, backup
policy and monitoring remain gates. No email
provider is approved yet; public signup remains closed and mail disabled until
real delivery is verified. Eventual Supabase hosting remains the accepted baseline.

See the [release operations runbook](release-operations.md) for health, read-only
smoke and guarded restore commands. The latest wellness-journal restore covers 23 tables
and 199 synthetic records, including a revision-2 journal entry and owned authentication quotas, with matching
content, constraints/indexes and readiness. The earlier verification restore also
covered a live private verification token. The latest rehearsal
preserves the source and removes only its generated disposable database. This
does not establish production backup retention, RPO/RTO or availability.

The [dependency safety record](dependency-safety.md) distinguishes tool-only
consumers from the bundled Router decoder and records remaining upstream risks.
Audit totals include affected parent packages; zero critical entries does not
mean the remaining dependency graph is clean or that the release is accepted.
The actual API container also has a filesystem packaging gate: corrected pruning
reduces installed packages from 438 to 106, removes observed test/CLI tools and
all five currently tracked leaf packages, and retains working generated Prisma
queries. Sixteen authenticated/anonymous HTTP checks and a 23-table/30-record
isolated restore pass. This is API artifact evidence; mobile/build advisories,
operating-system packages and production-host acceptance remain separate gates.
Eight installed-Router parser/serializer regressions cover ordinary and bounded
malformed links with a decoder invocation canary. They do not remove the bundled
decoder or establish mounted-app/hardware incoming-link acceptance.

The [Android permission policy](../requirements/android-permissions.md) removes
unused overlay, legacy shared-storage and biometric capabilities through Expo
configuration and checks the actual assembled APK before publishing a preview.
It retains current network/reminder/SDK support and rejects unreviewed additions
or lost core capabilities. Permission names alone do not establish SDK data
collection, native compatibility or accurate store disclosures.

Account privacy tests cover a disposable user's full record graph,
another user's unchanged records, public event preservation, all-token revocation,
incorrect password and rollback. An in-flight private import must not recreate
removed events. Export uses explicit public DTO fields and excludes credential,
session, provider-token or request-hash material. Describe server-saved export
coverage, with guarded late responses/share actions after account switches.

On deletion acknowledgment, hide the account immediately and clear this device's
stored session, account cache, focus recovery and scheduled reminders. Attempt all
cleanup operations even if one fails; show a meaningful retry state. Do not claim
success on a lost network acknowledgment, promise remote erasure of offline-device
caches, or invent a production backup retention period.

Store references reviewed earlier in this conversation:
- https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion
- https://support.google.com/googleplay/android-developer/answer/13327111
