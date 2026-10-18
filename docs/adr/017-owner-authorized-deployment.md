# ADR 017 — Owner-authorized deployment of reviewed releases

Status: Accepted

Date: 2026-10-18

## Context

ADR 013 prepared a hardened container release for the owner's server but kept
source local, and required a separate explicit approval before a locally built
runtime image (readable compiled JavaScript) was transferred. On 2026-10-18 the
owner chose a full autonomous loop that includes merging reviewed work and
deploying it to that server.

## Decision

This choice is the explicit approval ADR 013 required, for runtime images built
from reviewed commits on `main`. Source archives are still not uploaded and
nothing is built on the server. Images are built locally, tagged by commit and
transferred with `docker save | ssh docker load`.

Every deployment backs up the `campusflow` database before migrations and runs
migrations with the matching build image. It then recreates the runtime
container from staged release files and waits for loopback readiness. If the
recreate or readiness fails, the previous image and release files are restored
and their readiness is verified and reported. Public smoke checks (readiness,
closed-signup capability, anonymous rejection) run afterwards. A failure there
is reported for a fix-forward or redeploy, not rolled back automatically.
Migrations must be backward-compatible with the previous image
(expand/contract), because an image rollback does not roll back the schema. All other ADR 013 constraints
stay: loopback binding, a dedicated database and role, protected env file,
closed signup and disabled mail until a provider is approved, and no changes to
other applications.

## Consequences

The hosted API becomes available without the development PC. Public signup,
mail, store distribution and off-host backups remain separate gates (see
`docs/QUESTIONS.md`).
