# Email verification for public signup

Requirement source: ToR account/privacy/nonfunctional requirements; ADR 002 and
[ADR 010](../adr/010-email-verification.md). Native Android/iOS remain the release
priority. A verified mailbox is required before public account use, following
[OWASP email ownership guidance](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html).

| ID | Behavior | Automated evidence |
| --- | --- | --- |
| VERIFY-01 | Preview signup remains usable locally; public signup creates an unverified identity without a session; production defaults to closed and rejects preview mode | API auth-config / email-verification-db; contracts email-verification |
| VERIFY-02 | Public access requires a verified mailbox, including old preview sessions. Verification also revokes old sessions; only ordinary sign-in creates a fresh session | API email-verification-db; mobile account-gate / auth-verification |
| VERIFY-03 | Verification requires current account password plus a single-use 15-minute code bound to the current credential. No automatic activation from an unsolicited code | API email-verification-db; contracts email-verification; mobile email-verification |
| VERIFY-04 | Recovery and verification purposes stay separate. Reset removes old verification material without losing student data; deletion erases it; exports omit secret binding/code records | API email-verification-db / account-db / recovery-db |
| VERIFY-05 | Durable verification mail is encrypted, owner-bound and fenced. Retry preserves original code/expiry; old credentials, replaced owners and in-flight reset cannot revive proof | API email-verification-db / recovery-db / recovery-secrets / recovery-mail |
| VERIFY-06 | Shared source/recipient/global quotas limit signup, public login, resend and confirmation. Caller forwarding headers cannot select the source. Wrong-password login does not consume mail-request quota | API email-verification-db / recovery-rate |
| VERIFY-07 | Confirmation, signup and mail creation commit atomically, under the same User lock as login/reset/deletion; no nested transactions are needed for small database pools | API email-verification-db / recovery-db |
| VERIFY-08 | Global uncached capabilities honestly expose preview, verified or closed signup and unavailable verification. Verified login still works when signup/delivery closes | API email-verification-db / auth-config; mobile auth-verification / email-verification |
| VERIFY-09 | Native forms validate, preserve failed drafts, prevent duplicates and dismissal while pending, abort/ignore stale responses and clear secrets on success/owner change/navigation. Routes carry only supported account continuation | Mobile auth-verification / email-verification / auth-recovery-entry / account-gate |

Signup keeps the existing duplicate-address conflict; it never overwrites an
existing password. Resend accepts only correct account credentials and gives a
generic acknowledgment: a verified account or exhausted recipient quota can
produce no new mail. Recent codes retain their original expiry. Public login has
its own 8-attempt/15-minute recipient quota; mail requests have 3/hour, source
20/15 minutes, and global 2,000/hour limits. Confirmation has 8/15 minutes per
recipient, 20/15 minutes per source and 2,000/hour globally. Boundaries use one
trim/lowercase email comparison policy without provider-specific rewriting.

The API stores verification timestamps only after successful password-and-code
proof. It does not backfill existing users or issue a verification access token.
There are no codes/passwords in deep links, SQLite, query caches, logs or export.
The SMTP message explains how to recover an unsolicited account before verifying.
Passwords are never trimmed. Existing encrypted recovery envelopes retain their
version and associated-data format across deployment.

Evidence uses disposable PostgreSQL, synthetic identities and captured delivery.
Real provider acceptance, sender ownership, deployed trusted proxy policy,
native signed-device flows and production host/store gates remain unverified.
