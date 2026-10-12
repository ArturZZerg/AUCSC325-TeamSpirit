# ADR 013 — Initial native beta on the owner's server

Status: Accepted for an initial closed beta

Date: 2026-10-12

## Context

The owner authorized the existing server and supplied an Android device. The
server runs Nginx, valid HTTPS, PostgreSQL 16 and other applications; its host
Node 18 is older than this repository's Node 22 baseline. No email provider,
store signing or iOS acceptance is approved. ADR 001 specifies eventual Supabase
hosting. Account quotas under ADR 011 use socket peers until a proxy policy is
configured; Nginx clients would otherwise share the proxy's source quota.

## Decision

Use a separately named Node 22 container, release directory and PostgreSQL
database/role. Bind only loopback and publish through a distinct existing HTTPS
path. Preserve other apps, databases, routes and host Node. Package tracked
API/shared source locally; keep protected environment files/backups outside images.
The owner subsequently chose to keep source local. Do not upload source or build
it on the server. A locally built runtime image contains readable compiled
JavaScript, so transferring it requires a separate explicit approval. Hosting
authorization alone does not establish that approval or a deployed service.
Use a non-root runtime with bounded memory, processes and logs, and a separate
build target for reviewed migrations.

Opt-in `AUTH_SOURCE_MODE=loopback` requires explicit `HOST=127.0.0.1` or `::1`.
Only an actual loopback socket peer may provide one valid IP in `X-Forwarded-For`.
Malformed, repeated or chained values fall back to the socket. All account
admission endpoints share the policy; default `socket` ignores headers. Nginx
replaces forwarded headers with the actual client IP. Keep the API bound to
loopback; local administrators/services are inside this trust boundary. Do not
enable general Express proxy trust or arbitrary-hop configuration.

Use production startup validation, a protected independent authentication key,
disabled Canvas/mail and closed signup. Any private synthetic acceptance account
is test data; manual provisioning does not prove SMTP mailbox verification or
authorize public registration. Keep credentials/private data out of source,
images, APKs, PRs and diagnostic output.

Back up the initial CampusFlow database and affected Nginx configuration before
publication. Rehearse restore into a separately generated host database. State
only observed retention/availability; same-host backup is not disaster recovery.
Build Android with the actual HTTPS API, install preserving app data, and verify
connectivity, lifecycle, cached reads, mutations, reminders and incoming links.
Preview signing does not establish store signing. Eventual Supabase remains
available through the unchanged backend/database boundary; add no Supabase Auth
or mobile database access.

## Consequences

Once an approved deployment passes acceptance, the native beta can work without
the development PC or ADB reverse. Shared host
availability/capacity require observation. This is temporary hosting, not a
commercial release: email, iOS, support/privacy, off-host backups, stores, live
Canvas and unresolved dependency dispositions remain separate gates.
