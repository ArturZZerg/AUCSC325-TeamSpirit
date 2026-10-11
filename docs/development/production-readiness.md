# CampusFlow release evidence and remaining gates

This is a technical readiness record, not a claim that the current build is ready
for store submission.

| Area | Confirmed evidence | Required before production |
| --- | --- | --- |
| Daily workflow | Tasks, Today, planner, classes, preparation, focus/history/report, routines, wellness, campus discovery and workload inbox; automated behavior tests and real API/cache browser checks | Full acceptance script on authorized Android and iOS devices, including keyboard, accessibility, lifecycle and offline cold start |
| Account privacy | Password-confirmed whole-account deletion, complete versioned export, private-import race protection, attempt-all cleanup/retry, ordinary web sign-in and actual JSON download verified | Authorized native share/cleanup acceptance, hosted HTTPS `/account` resource and declared backup/log retention; shared password-challenge rate limits if replicated |
| Account recovery | Password authentication and sessions exist | Chosen email provider, verified recovery flow, expiry/single-use/rate limits and email-delivery proof |
| Backend hosting | NestJS/PostgreSQL architecture, migrations and local integration tests | Authorized production project, secrets, migration/backup/restore rehearsal, TLS, health monitoring, capacity and availability checks |
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
