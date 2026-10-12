# Password recovery operations

Recovery uses the existing NestJS API/PostgreSQL database under [ADR 009](../adr/009-password-recovery.md).
The native app is the first-release priority. `/recover` also renders in the web
build; no PWA delivery change is included. Development uses a captured delivery
port and disposable accounts. There is no public code-fetch or fake-mail endpoint.

## API and delivery lifecycle

| Endpoint | Behavior |
| --- | --- |
| `GET /auth/recovery/capability` | Global `{ available, expiresInMinutes: 15 }`, private/no-store; never account-specific |
| `POST /auth/recovery/request` | Strict email body; generic 202 `{ accepted: true }` for registered, absent and recipient-cooled-down addresses |
| `POST /auth/recovery/reset` | Strict email/code/newPassword body; 200 `{ reset: true }` after atomic completion; generic invalid/expired code error otherwise |

Requests perform no account lookup and do not wait for SMTP. The worker resolves
ownership after acknowledgment. Delivery failures do not alter passwords or lock
ordinary sign-in. Source/global limits return generic 429 responses; unavailable
configuration returns 503. The client requires an explicit tap to retry.

The worker claims up to five jobs per pass with PostgreSQL `SKIP LOCKED`, a
120-second UUID-fenced lease and a maximum of eight attempts. Each SMTP attempt
has a 45-second overall deadline and shorter connection/socket timeouts. Retry
delays grow from 2 to 60 seconds; encrypted code and original 15-minute expiry
remain unchanged after retries/restarts. Finished, expired, invalid and exhausted
envelopes are discarded. Up to 500 expired rows per operational table are cleaned
per pass, including once per minute while delivery is disabled. Cleanup skips
locked rows so another transaction cannot hold up unrelated mail delivery.
Nest drains recovery/campus workers during module teardown before Prisma
disconnects in the later application-shutdown phase.

All raw SQL timing uses explicit UTC to match Prisma timestamp fields regardless
of the PostgreSQL session timezone. SMTP runs outside account transactions.
An already in-flight message can arrive after reset/deletion, but its code cannot
restore deleted owners or invalidated credentials. At-least-once delivery can
duplicate an identical email if SMTP accepts it before acknowledgment is saved.

Reset and sign-in issue sessions under the same User lock. Reset changes the
salted scrypt password, revokes all existing sessions, removes every outstanding
reset token and pending recipient envelope, and queues a password-change notice
in one transaction. A failed commit preserves the previous credentials/sessions.
Student data remains unchanged; the client returns to ordinary sign-in.

## Before enabling real delivery

The default is `RECOVERY_DELIVERY=disabled`. Enable `smtp` only after the owner
supplies and approves these settings on the deployment:

- `RECOVERY_OUTBOX_KEY`: canonical base64 for a cryptographically random 32-byte
  key, API-only. Preserve it across replicas and while mail is pending. Rotation
  abandons old encrypted envelopes; do not print or commit this key.
- `RECOVERY_WEB_URL`: exact public HTTPS origin, without path/query/fragment.
  The email's `/recover` link contains no reset credential. Native users can
  paste the code into Forgot password in the app.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE` (`implicit` or `starttls`),
  `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: approved sender/provider settings.
  Implicit TLS defaults on port 465; other ports require STARTTLS. Certificate
  verification and TLS 1.2 or later are mandatory.

Apply migration `20261011010000_password_recovery` before starting the new API.
Verify actual sender/domain authorization, provider delivery and spam behavior,
public HTTPS routing and certificate validation using approved test recipients.
The current source quota uses the actual socket peer and ignores forwarded
headers. A deployment behind a proxy must establish and test its trusted source
address policy before enabling recovery; otherwise users share the proxy quota.
Recovery has separate global request/reset limits of 2,000/hour, per-source
request/reset limits of 10/20 per 15 minutes, and recipient request/reset limits
of 3/hour and 8/15 minutes. Review suitability against the intended deployment.

Monitor the generic worker warning and private queue age/count on the authorized
host without logging addresses, code/password bodies, SMTP errors or secrets.
Declare encrypted-backup and log retention. Account erasure removes linked and
not-yet-linked envelopes plus recipient quota metadata; aggregate/source quota
rows expire separately. These private records are excluded from account export.

## Acceptance evidence and limits

Automated tests use isolated PostgreSQL and a captured mail port for generic
acknowledgment, input validation, shared quotas, UTC timing, wrong/expired codes,
single-use races, rollback, session revocation, both sign-in/reset lock orders,
provider failure, stable retries/restarts, fencing, shutdown, tampering, exhausted
attempts and account deletion. SMTP adapter tests verify TLS/deadline/message
policy without connecting to real recipients. Native screen interaction tests
cover validation, drafts, cooldown, pending/dismissal, unavailable states and late
replies after unmount or sign-in. No sensitive draft enters routes or cache.

Browser QA verifies the real request/acknowledgment and code-entry layout at
320/390/1100px, safe account return and client validation. Browser password-change
submission is not claimed; disposable API tests and native component tests cover
reset completion separately. Real SMTP, hosted proxy policy, signed-device/iOS
acceptance and registration email verification remain release gates.
