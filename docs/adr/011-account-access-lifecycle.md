# ADR 011 — Account access lifecycle independent of mail delivery

Status: Accepted; local automated/API/restore acceptance verified, production host/device acceptance pending

Date: 2026-10-11

## Context

ADR 010 requires mailbox proof before public access and rejects unverified preview
sessions. The native client can restore an old session and cached data without
checking whether the API still accepts that credential. It needs a complete route
back to ordinary sign-in after a confirmed revocation, expiry or public cutover.
Network failure must still preserve the accepted offline-read guarantee.

Public login currently has shared quotas while SMTP is available; disabled-mail
login and password-confirmed deletion use process-local limits. Replicas or a mail
outage must not remove production authentication limits. Quota admission must
survive a rejected password or failed delete transaction, and small database pools
must not require nested transactions while the User is locked.

## Decision

Keep the existing NestJS/PostgreSQL identity and Expo session/cleanup services.
Add no database, queue, external authentication framework or deployment service.

Validate a restored/current native session with bounded private `GET /me` on
startup and return to the foreground. Deduplicate overlapping checks, abort on
detach, and compare the captured account/token before handling any response.
Only a confirmed 401 for the still-current session triggers existing attempt-all
account cleanup and ordinary sign-in. Offline, timeout, 5xx and malformed reads
leave cached reads usable. An older reply cannot sign out a new account.
Show an honest reauthentication notice and preserve cleanup failure/retry behavior.
Do not automatically create a new session, accept an arbitrary redirect or infer
mailbox proof from local state. Server-saved student data is retained.

Use validated API-only authentication-rate configuration with an independent,
stable random secret. Production requires the shared configuration, even when
signup/mail is closed. Local/test defaults preserve preview convenience and the
existing local password protections. Do not impersonate SMTP configuration to
enable an unrelated limiter or couple quota identity to rotating outbox keys.

Reuse the existing private rate-bucket persistence and proven UTC/atomic counter
SQL with separate authentication namespaces. Add nullable User ownership for
password-challenge buckets, with cascade erasure, while anonymous/source/global
buckets remain bounded operational metadata. Persist global/source/recipient
login limits and owned password-challenge limits across replicas. Use the actual
socket peer until the production trusted-proxy policy is explicitly configured.
Rejected attempts commit admission counts before an exception is returned.

Admit a password challenge in its own bounded transaction before the account
delete transaction. Lock User first while recording owned quota metadata so
deletion cannot leave a late owned bucket behind. Release that admission lock,
then re-read and verify the current credential under the existing exclusive User
lock before deletion. Preserve the reset/login/deletion lock order and account
export whitelist. Account deletion clears recipient metadata and cascades owned
quota rows; aggregate abuse limits are retained for their bounded windows.

## Validation and gates

Cover restored/expired/revoked/public-cutover sessions, offline/timeout/5xx versus
401, foreground/dedup/unmount/late-owner responses, cleanup failure and supported
account continuation. Verify shared login/password admission with SMTP disabled,
replicas, wrong credentials, rate denial, failed mutation, deletion races,
forwarded-header rejection and a single-connection pool. Test configuration
redaction, counter expiry, privacy/export and erasure. Complete root checks,
fresh artifacts, actual disposable API/restore acceptance and the exact-head
PR/review/CI/merge loop.

Real mail, trusted deployment source policy, authorized HTTPS host, Android/iOS
signed-device acceptance and store/privacy/support gates remain unverified. No
preview fixture or local cache can establish production readiness.
