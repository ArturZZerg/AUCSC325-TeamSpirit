# Student password recovery

Status: implemented on `codex/account-recovery`; release acceptance pending.

A student can choose Forgot password from sign-in, request a code for the account
email and enter that code with a new, confirmed password. Keep the existing calm
CampusFlow palette and native form/button primitives. Use one focused screen with
clear request/code stages, an explicit already-have-a-code action and return to
ordinary sign-in after success. Preserve the account-management return target.

Validate email, bounded code paste and the existing 12–128-character new-password
policy through shared contracts. Show loading/unavailable, submitting, generic
acknowledgment, resend cooldown, failed retry, invalid/expired/used code and saved
states. Preserve unsuccessful in-memory drafts; discard sensitive inputs when
leaving or switching accounts. Block repeated submissions and ignore late replies.
No reset credential belongs in a route, cache, browser history or response body.

API capabilities report only whether delivery is configured. Disabled recovery
must neither send nor silently pretend that an email was delivered. When enabled,
valid email requests have equivalent acknowledgment/work regardless of account
existence. Shared source/global quotas and recipient cooldown bound mail abuse
without disabling ordinary sign-in. Requests never alter student data or passwords.

Under ADR 009, the existing API/DB owns encrypted durable mail delivery, bounded
fenced retries and expiring token hashes. A successful code can change exactly one
account password once, revoke all old sessions and invalidate other pending codes
atomically. Concurrent sign-in/reset/deletion must not revive old credentials or
deleted owners. Wrong/expired codes preserve the account and saved student data.
Queue a password-change notice without exposing the new password.

Acceptance includes schema/cascade/privacy checks, malformed input, wrong email,
expiry, concurrent redemption and old-session rejection; stable retry/restart,
lease fencing, provider failure and encrypted payload tampering; UI keyboard,
pending/draft/retry/late-owner behavior at narrow and wide web sizes. Use a captured
test mail port and isolated real PostgreSQL for local acceptance. Run root checks,
fresh web/native builds, release smoke/restore and exact-head CI before PR merge.

Real provider/sender delivery, hosted TLS/proxy policy and signed Android/iOS
interaction remain release gates. Registration email verification is a separate
public-onboarding requirement. Never enable production mail with invented owner
credentials or describe fixture delivery as a verified production provider.

Current automated evidence: full lint/boundaries/types/test/build gate passes
1,676 tests (547 API, 824 mobile, 109 contracts, 173 domain, 3 Android build-script
and 20 release/dependency). Recovery tests cover strict contracts, crypto/config,
atomic shared quotas, privacy/erasure, real PostgreSQL request/reset transactions,
both sign-in/reset lock orders, durable delivery and native screen interactions.
UTC SQL is tested against an Auckland-time database connection; local PostgreSQL
also runs in Denver time. Browser QA verifies request/acknowledgment, code-entry
validation and responsive layout, with reset completion covered separately by
disposable API and native component tests. See the [operations runbook](../development/password-recovery.md)
for the migration, settings, retry guarantees and remaining delivery/device gates.
Fresh web/Android builds, preview signing/privacy checks and actual API/web smoke
pass. A running API with captured delivery completes reset while retaining a
synthetic task; old sessions/password and repeated code are rejected. The final
restore matches 22 tables/201 synthetic records and preserves the source.
