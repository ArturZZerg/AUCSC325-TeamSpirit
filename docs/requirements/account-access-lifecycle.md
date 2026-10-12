# Account access lifecycle

Requirement source: ToR account privacy, availability and cached-use requirements;
[ADR 011](../adr/011-account-access-lifecycle.md). Native Android/iOS remain first.

| ID | Behavior | Automated evidence |
| --- | --- | --- |
| ACCESS-01 | Restored/current credentials are checked with bounded uncached `/me` on startup and foreground; overlapping checks are deduplicated and detach aborts | Mobile session-access |
| ACCESS-02 | Only a confirmed private 401 for the current owner/token signs out; offline, timeout, 5xx, rate denial and malformed reads retain cached access | Mobile session-access; API auth-and-plan / email-verification-db |
| ACCESS-03 | A late response, aborted request (including cancelled cached queries), explicit other credential or wrong public login cannot sign out a new owner/session | Mobile session-access / queries / session / auth-verification |
| ACCESS-04 | Reauthentication explains retained server data, routes to ordinary sign-in and supports only account continuation; all private cleanup is attempted, retry remains available and new login waits for cleanup | Mobile session-access / auth-verification / account-gate / session |
| ACCESS-05 | Production requires an independent stable random auth key; mail-disabled/closed signup deployments retain shared login and password quotas | API auth-rate-config / auth-rate-db |
| ACCESS-06 | Atomic source/recipient/global limits are shared across replicas; rejected passwords, successful logins and later rollback cannot reset admission; actual socket source ignores forged forwarding headers | API auth-rate-db |
| ACCESS-07 | Password admission commits before mutation and locks User before owned metadata; deletion cannot leave late owned buckets. The mutation rechecks current credentials under the existing exclusive User lock, without nested transactions | API auth-rate-db / account-db / recovery-db |
| ACCESS-08 | Quotas expose no email/source/key in responses or exports; deletion erases owned/recipient metadata while retaining bounded aggregate abuse windows; expired counters are cleaned with mail disabled | API auth-rate-db / recovery-rate-db / account-db / recovery-lifecycle |

Shared login permits 8 attempts per recipient and 40 per socket source in 15
minutes, plus 2,000 globally per hour. Shared password challenges permit 8 per
owner and 40 per socket source in 15 minutes, plus 2,000 globally per hour.
All admitted attempts count, including successful login and failed persistence.
Denied requests commit their counters before returning 429. Reset/verification
mail retains its separate quotas. The generic retry message does not promise
that the longer global window has expired after 15 minutes.

`AUTH_RATE_KEY` is API-only, canonical base64 for 32 random bytes, shared across
replicas independently of `RECOVERY_OUTBOX_KEY`. Production refuses a missing or
invalid key even with mail disabled; local/test without it retains bounded local
preview protections. Changing this key changes anonymous quota identity, so
rotation requires a reviewed abuse/rollout plan. It is never a client setting.

The additive migration adds nullable User ownership and a cascade to the existing
private counter table. No legacy data backfill, auth framework, queue or dependency
is added. Counter expiry uses UTC instants even on non-UTC database connections.
The existing bounded worker cleanup runs while mail is disabled.

`/me` returns only public profile fields with `private, no-store`. Native validation
does not infer expiry from the device clock or renew access automatically. A 401
clears account cache, scheduled reminders, exports and device draft via the existing
serialized cleanup; authoritative student data remains on the server. A lost or
unavailable read cannot establish revocation and leaves the offline-read guarantee
intact. Other offline devices learn revocation only when they reach the API.

Evidence uses isolated PostgreSQL and native component/API tests. Real production
proxy source policy, monitoring/capacity, host/mail, signed Android/iOS lifecycle
and store/privacy/support acceptance remain separate release gates.
