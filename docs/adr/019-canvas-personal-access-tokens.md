# ADR 019 — Canvas personal access tokens for the course prototype

Status: Accepted

Date: 2026-10-20

## Context

ADR 001 and the Canvas development notes kept live Canvas access behind
institution-approved backend OAuth, and no endpoint accepted Canvas tokens. The
developer key, scopes and HTTPS callback need the university's Canvas admin, and
that approval can't land before the prototype demonstration on 2026-10-25. The
owner decided on 2026-10-20 that students should connect their own Canvas
account with a personal access token, which Canvas lets every user create under
Account → Settings → Approved Integrations.

## Decision

- New `CANVAS_MODE=token`, allowed in production only with `CANVAS_TOKEN_KEY`
  (32 random bytes in canonical base64, API-only, independent of the other keys).
  Fixture mode stays development/test only, unchanged.
- `POST /canvas/connect` accepts `{ baseUrl, accessToken }`. The API normalizes
  the address to an HTTPS origin, refuses literal IPs, local names, non-default
  ports and hosts resolving to private, loopback or link-local addresses, then
  verifies the token with `GET /api/v1/users/self`. Only then is the token stored,
  sealed with AES-256-GCM bound to the account id, in the existing
  `CanvasConnection.encryptedAccessToken` column. No schema migration.
- Tokens never leave the API: they are not returned, logged or put in errors.
  The mobile app sends the token once and keeps nothing.
- `POST /canvas/sync` reads active courses and their assignments with the
  student's submission (`include[]=submission`) outside the database transaction,
  bounded at 25 seconds, with same-origin pagination only and no redirects. The
  normalized batch is then written under the per-account lock with the existing
  idempotent upserts, using `source=canvas`. A sync is discarded if the stored
  token changed during the fetch.
- A background worker (single API replica) syncs token connections whose last
  attempt is over 30 minutes old, at most 20 per 5-minute pass. After a failure
  it retries that account only every 6 hours, so a revoked token is not hammered.
- A rejected Canvas token returns 409, never 401, so it can't end the CampusFlow
  session. `DELETE /canvas/connection` forgets the token; imported records stay.
- Fixture records (`canvas:fixture`) and live records (`canvas`) never overwrite
  each other.

## Consequences

Anyone with a Canvas account can connect without institutional approval. A
personal token grants the same access as the student's own Canvas session until
it expires or is revoked, so a database and key compromise together would expose
Canvas accounts. The key lives only in the API env file. The DNS check runs before
each request batch, but a hostile resolver could still rebind between check and
fetch. That is acceptable for a course prototype and must be revisited before a
public release. Institutional OAuth remains the long-term path: it replaces only
the connect step, and the sync and mapping code stays.

Planner items, calendar events and removal reconciliation were added later by
[ADR 025](025-canvas-planner-calendar-and-removals.md).
Assignments are capped at 2,000 per sync (undated and recent work first) and
courses at 60.
