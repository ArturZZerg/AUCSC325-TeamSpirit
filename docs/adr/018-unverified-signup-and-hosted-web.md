# ADR 018 — Unverified signup and hosted web app for the course project

Status: Accepted

Date: 2026-10-18

## Context

CampusFlow is a school project. On 2026-10-18 the owner decided that it does
not need an email provider. Without mail, ADR 010 verification and ADR 009
recovery cannot run, and production previously allowed only `closed` or
`verified` signup, so a new student could not create an account. The owner also
approved hosting the web build. No DNS change is available for a new
subdomain, so it shares the existing HTTPS host.

## Decision

- Production may use the existing `preview` registration behaviour (a session
  is issued without proving the mailbox) only when `ALLOW_UNVERIFIED_SIGNUP=true`
  is set as well. Either setting alone keeps the previous behaviour. Mail
  delivery and password recovery stay disabled, and the sign-up screen says so.
- ADR 011 never limited signup, so unverified signup gets its own shared
  admission before any password hashing: 10 attempts per source and 200
  overall per hour, counting duplicates, so a 409 can't be used for unlimited
  address probing. Local development, without a shared key, stays unlimited.
- The Expo web export is built with base path `/campusflow` and the hosted API
  URL. It is served by the existing Nginx at
  `https://workout.vakula-dev.com/campusflow/` from a release directory, with
  the cross-origin isolation headers that SQLite on the web requires.
  The API stays at `/campusflow-api/`, on the same origin.

## Consequences

Anyone can register with any address, including one they don't own, and a
forgotten password can't be recovered by email. Accounts created this way have
no verified mailbox. Switching back to `verified` would lock them out until they
verify, and an address someone else squatted can't be reclaimed without mail
recovery for unverified users. Plan that migration before the switch.

The web app shares its origin with the host's other applications. Its session
token lives only in memory, but its SQLite cache and its requests are within
reach of script on any page of that origin, including a service worker
registered at `/`. This is acceptable only because the owner controls every
co-hosted app. A dedicated subdomain removes the assumption. Framing is denied
(`X-Frame-Options`, CSP `frame-ancestors`). That is acceptable for a
course project and must be revisited (back to `verified` with a provider)
before any real public release. Native builds and local development are
unchanged.
