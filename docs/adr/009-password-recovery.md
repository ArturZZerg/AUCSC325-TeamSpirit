# ADR 009 — Password recovery within the existing API

Status: Accepted for implementation; delivery and release acceptance pending

Date: 2026-10-11

## Context

ADR 002 provides independent CampusFlow password accounts and revocable sessions.
A student who forgets a password currently has no recovery workflow. Waiting for
SMTP inside the request would expose account existence through provider latency
and failures. An in-memory mail task could disappear on an API restart. Production
mail credentials, sender/domain approval and actual delivery remain unconfigured.

## Decision

Keep recovery in the single NestJS API and authoritative PostgreSQL database.
Use three private operational records: expiring reset-token hashes, a small
encrypted recovery-mail outbox and shared expiring rate buckets. No separate
service, queue infrastructure or identity provider is introduced. These records
are not app domain tasks, cached mobile data or public account-export content.
Recipient digests support removal of not-yet-linked mail when an account is
deleted, even while sending is disabled. They are private security metadata,
not anonymized data; source quota identifiers use an API-keyed hash. Expiring
recipient rate metadata is removed with account recovery material on deletion.

The unauthenticated request endpoint performs the same bounded queue operation
for every syntactically valid email and returns a generic acknowledgment without
looking up an account. The API's delivery worker resolves ownership later. A
recipient cooldown also returns the same acknowledgment; source/global overload
returns a generic rate error. Limits are atomic in PostgreSQL across replicas.
Recovery requests never lock ordinary sign-in or change a password.

Generate a 120-bit random code, display it in five groups of six hexadecimal
characters and allow safe paste normalization. Code entry works in native and
web clients without putting secrets in routes, request URLs or browser history.
Keep only a hash in the reset-token table. A separate API-only 256-bit key encrypts
outbox recipient/code payloads using AES-GCM bound to the message ID. SMTP uses
certificate-verified TLS; all credentials and encryption keys stay on the backend.
The initial transport is standard SMTP, without selecting a production vendor.

An API lifecycle worker claims bounded batches with fenced, expiring leases.
Retries keep the same code and expiry, including after process restart. SMTP may
accept a message before its acknowledgment is persisted, so delivery is at least
once: duplicate emails can contain the same code, never a newly minted retry code.
Expired/finished envelopes are removed. Raw provider errors, addresses, codes and
passwords must not enter logs or responses.

Reset completion locks the User before validating the still-live token. It changes
the salted scrypt password, invalidates all outstanding recovery material and
revokes existing sessions in one transaction, then queues a password-change notice.
Sign-in issuance must serialize on the same User lock so a pre-reset password
cannot create a valid session afterward. Account deletion removes linked and
not-yet-linked recovery envelopes. Existing student records are preserved.

Recovery expires after 15 minutes and requires ordinary sign-in after success.
The client confirms the new password, keeps drafts only in component memory and
shows honest pending, generic acknowledgment, retry, invalid/expired code and
success states. It must ignore late replies after leaving recovery or signing in.
Delivery defaults to disabled; public capability and the UI reflect that state.
There is no production fake-mail mode or token retrieval endpoint.

## Consequences and gates

Deploy the migration and configure the approved SMTP sender/TLS credentials and
outbox key before enabling recovery. Preserve the key while jobs are pending;
changing it deliberately abandons old pending recovery messages. Backups may
retain operational data according to the still-unapproved host retention policy.
Proxy/source-address policy must be verified on the actual deployment; do not
trust arbitrary forwarded headers. Monitor queue failures without private data.

Verify request equivalence, shared throttles, expiry, concurrent single-use/reset/
sign-in/deletion, restart/retry leases, cryptographic tampering and message privacy
with disposable database records and a captured test delivery port. Verify real
SMTP delivery and native/web entry on authorized targets separately. Registration
email verification remains a public-onboarding gate; recovery does not establish
that a previously registered address was verified at signup.

References: [ADR 002](002-account-authentication.md),
[OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html),
[SMTP transport](https://nodemailer.com/smtp).
