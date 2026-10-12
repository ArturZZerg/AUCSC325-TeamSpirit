# ADR 010 — Mailbox verification before public account access

Status: Accepted; local captured-delivery acceptance verified; production delivery/device acceptance pending

Date: 2026-10-11

## Context

ADR 002 defers email verification until an approved delivery provider exists.
PR #63 implements password recovery and a private durable SMTP outbox, with
delivery disabled by default. An email entered during registration still does
not establish mailbox ownership. Production signup needs that proof, while
existing local development accounts and student records must remain usable.

Verification must also prevent account pre-hijacking: another person could
register an address using a password the mailbox owner does not know. Merely
redeeming an unsolicited email code must not enable that password's account.

## Decision

Keep identity, verification and delivery in the existing NestJS/PostgreSQL API.
Add nullable `User.emailVerifiedAt` and a private expiring verification-token
record bound to the User and current credential digest. Existing users receive
no invented verification timestamp. Never expose/export token or credential
digests. Preserve all student data and independent recovery-token purposes.

Use explicit registration modes: local preview, verified public signup or closed
signup. Production defaults to closed signup. Local/test defaults retain the current preview registration/session
behavior. Production permits only verified or closed signup, and verified signup
requires complete approved mail configuration. Capability DTOs expose global
availability/mode, without account-specific lookups or secrets.

Verified signup creates an unverified identity without an app-access session.
Correct-password login for an unverified identity offers verification, also
without an app-access session. Session enforcement checks mailbox verification
in public mode, including sessions issued earlier in preview. Verified users can
still sign in when new signup/delivery is temporarily closed.

Verification requires the email, single-use bounded code and the account password.
It locks User before checking the live token, credential binding and password;
it sets the verification timestamp atomically and returns to ordinary sign-in.
An unsolicited code alone cannot enable someone else's chosen password. Existing
owners who do not know the password use the separate recovery workflow first.
Password reset invalidates outstanding verification material as well as sessions.

Reuse the encrypted durable mail queue, TLS adapter, replica-safe quotas and
fenced retries from ADR 009. Extend its envelope with an explicit verification
purpose; retain existing envelope associated-data/version handling so pending
recovery jobs survive deployment. The historical `RecoveryMail` table name can
remain as an internal compatibility detail. A verification token can never redeem
at the recovery endpoint, and a recovery code can never verify an account.
Resending requires the account password and does not modify stored credentials.

Extend registration/login contracts with an explicit verification-required result
alongside the existing Session shape. Native forms handle both, without caching
email codes/passwords or putting them in routes. Preserve safe account return,
failed drafts, bounded resends, pending/dismissal and late-owner guards. Report
disabled public signup honestly. Preview account behavior remains explicit.

## Validation and release gates

Cover new/existing users, preview/public/closed mode, correct/wrong password,
unsolicited/cross-purpose/expired/reused codes, reset/deletion races, old-preview
session rejection in public mode, atomic timestamp updates, outbox privacy and
late native responses. Use disposable PostgreSQL and captured delivery only.
Preserve existing preview behavior tests and complete root checks, builds,
artifact/privacy/restore acceptance and exact-head CI before the feature PR merge.

Real sender delivery, deployed source/proxy policy, production configuration,
signed Android/iOS acceptance and store/privacy/support details remain separate
release gates. No fake-mail public endpoint or automatically verified legacy
backfill is permitted.
