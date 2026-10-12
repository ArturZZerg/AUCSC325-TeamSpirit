# CampusFlow release evidence and remaining gates

This is a technical readiness record, not a claim that the current build is ready
for store submission.

| Area | Confirmed evidence | Required before production |
| --- | --- | --- |
| Daily workflow | Tasks, Today, planner, classes, preparation, focus/history/report, routines, wellness, campus discovery and workload inbox; automated behavior tests and real API/cache browser checks | Full acceptance script on authorized Android and iOS devices, including keyboard, accessibility, lifecycle and offline cold start |
| Account privacy | Password-confirmed whole-account deletion, complete versioned export, private-import race protection, attempt-all cleanup/retry, ordinary web sign-in and actual JSON download verified | Authorized native share/cleanup acceptance, hosted HTTPS `/account` resource and declared backup/log retention; shared password-challenge rate limits if replicated |
| Account recovery | Request/reset, encrypted durable mail, shared quotas, single-use/expiry/rollback and sign-in/reset session races verified with disposable PostgreSQL; native recovery UI states and narrow/wide browser request layout verified under ADR 009 | Approved SMTP sender/provider and real delivery, deployed trusted proxy/source policy, signed-device acceptance |
| Public signup | ADR 010 adds password-and-code mailbox verification, private purpose/credential-bound tokens, public session gating, explicit preview/verified/closed modes and native verification forms; root checks and running captured-delivery signup/verification/login acceptance pass | Approved real mail delivery and signup configuration, signed-device acceptance and deployed abuse monitoring; shared login/password-challenge quotas when SMTP is disabled and the API is replicated |
| Backend hosting | NestJS/PostgreSQL, bounded read-only schema/migration readiness, production configuration validation, actual local smoke and snapshot-consistent restore rehearsal; CI also restores its disposable DB | Authorized production project/secrets, real migration/backup/restore policy and host rehearsal, TLS, health monitoring, capacity and availability checks |
| Dependencies | Reviewed compatible patches, effective scoped Prisma CLI overrides, clean install and real CLI/app/build/smoke/restore verification; both audit reports have zero critical entries | Five unresolved leaf advisories and their actual runtime/bundle paths need supported upstream fixes or explicit reviewed release disposition; see the dependency evidence record |
| Canvas | Normalized fixture integration and idempotency tests; production OAuth is disabled | Institution-approved key/scopes/callback, protected token storage and authorized live sync/revocation test |
| Public campus events | Reviewed Augustana calendars, persisted feed coverage, replica-safe imports and failure preservation | Intended campus approval/configuration and observed successful imports on the deployed API |
| Notifications | Server intent, local reconciliation and behavioral tests | Device permission, edit/delete/reschedule, quiet hours and duplicate-prevention acceptance; offline/other-device limitations accurately disclosed |
| Mobile builds | Locally signed Android preview, signature checks; no synthetic QA credentials in package | Production signing/identifiers, store builds, installation/backend connectivity and signed-device acceptance; iOS build/signing on supported host |
| Web artifacts | Reproduced Metro environment-cache issue; build now clears cache; fresh referenced entry and packaged bundles inspected | Fresh deployment output with authorized HTTPS API/domain; validate actual hosted assets and avoid publishing old generated bundles |
| Privacy/support/store | Technical data ownership and lifecycle are documented | Owner-approved public privacy/support URLs, real backup/log retention and accurate Apple/Google data declarations; store metadata/review account |

The deployment information question remains pending: which Supabase project,
app domain and transactional email service should be used. Development can
continue on privacy, recovery interfaces, release scripts and acceptance coverage
without choosing an unauthorized production target or inventing credentials.

See the [release operations runbook](release-operations.md) for health, read-only
smoke and guarded restore commands. The final verification restore covers 23 tables
and 194 synthetic records, including a live private verification token, with matching
content, constraints/indexes and readiness. It
preserves the source and removes only its generated disposable database. This
does not establish production backup retention, RPO/RTO or availability.

The [dependency safety record](dependency-safety.md) distinguishes tool-only
consumers from the bundled Router decoder and records remaining upstream risks.
Audit totals include affected parent packages; zero critical entries does not
mean the remaining dependency graph is clean or that the release is accepted.

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
