# Release health and verification

Status: implemented after Account & privacy PR #60; see the
[release operations runbook](../development/release-operations.md) for commands,
verified local evidence and remaining production gates.

Prepare executable release evidence within the existing NestJS/PostgreSQL/npm
architecture. Feature tests and a preview APK do not establish production uptime,
safe configuration, restorable backups or signed-device acceptance.

## Runtime health

Provide minimal unauthenticated liveness and dependency readiness endpoints.
Readiness checks PostgreSQL and the required application schema with a bounded
wait, returns 503 when unavailable and exposes no credentials, user information,
connection strings, raw database errors or schema internals. Liveness establishes
only that the API process is responding. Avoid external Canvas/calendar calls in
health handlers; core application availability must not depend on providers.

Validate production startup configuration explicitly, including database settings
and the allowed HTTPS web origins. Retain ordinary development defaults, mobile
access and disabled unapproved Canvas authorization. Do not invent a production
target, domain, email provider or credentials while owner details are pending.

## Release smoke checks

Add a repeatable read-only command for health, required HTTPS/origin configuration,
an authenticated synthetic-account path and current web artifact references.
Make failures actionable without printing bearer tokens or private response bodies.
Validate the requested mode: a preview using localhost cannot pass as production.
Inspect fresh output, referenced JS/WASM and required hosting headers instead of
accepting a successful build as evidence that the deployed site works. The web
SQLite runtime requires the appropriate isolation/asset MIME configuration.

## Restore rehearsal

Document and execute a backup/restore rehearsal only against the existing isolated
loopback test database, restoring into a newly named disposable database and
verifying records/relationships. Preserve the source database. Keep dumps and
credentials ignored. Guard host, port, database names and output paths before
creating/removing test resources. Do not run against an unspecified production
database or infer a real retention policy/RPO/RTO from local testing.

## Acceptance

Test healthy/unavailable/timeout/missing-schema behavior, private error handling,
production versus development configuration, smoke success/failure and artifact
references. Run required root gates and a real isolated API smoke/restore rehearsal.
Complete the branch/PR/self-review/exact-commit CI/merge cycle. Keep hosted mail
delivery/recovery, TLS/deployment/production restore, approved live Canvas,
Android/iOS signing/device acceptance and store/privacy declarations explicit in
the [production readiness record](../development/production-readiness.md).
