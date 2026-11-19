# ADR 028 — Server-hosted CI and owner-triggered server deploys

Status: Accepted

Date: 2026-11-19

## Context

GitHub Actions refuses to start any job on this repository ("The job was not
started because your account is locked due to a billing issue"). A billing lock
also stops self-hosted runners. Since 2026-11-10 a maintainer has run
`scripts/ci-local.sh` by hand to post the `local-verify` status that branch
protection on `main` requires. That made every merge wait for one person's PC,
and the iOS simulator workflow has not run at all.

The owner's server (ADR 013, ADR 017) already runs the API. It has Docker, but
it is small (2 vCPU, about 4 GB RAM) and other sites and databases share it.

## Decision

CI runs on the owner's server instead of GitHub Actions. `.github/workflows` is
removed.

* `scripts/ci-local.sh` is the single definition of the pipeline: `npm ci`,
  Prisma generate and migrate on a disposable PostgreSQL 17, `npm run check`,
  the web export, the restore rehearsal, and the isolated production API
  container checks. It still runs on any machine with Docker.
* `ops/ci/server-ci.sh` runs from a systemd timer every two minutes and tests
  one commit per start: the head of `main` first, then open PRs. It posts the
  same `local-verify` status, so branch protection is unchanged.
* PRs from repository collaborators run automatically. Other PRs run only after
  a maintainer adds the `ci:run` label, which the runner removes after each
  run. Code from outside the team never runs on the shared server unreviewed.
* The runner is installed from `main` into `/opt/campusflow-ci` by
  `ops/ci/install.sh`; a PR under test cannot change the runner. The GitHub
  token stays on the server, is scoped to this repository, and is never passed
  into a test container.
* The test container is capped (1.5 CPU, 2 GB memory, low CPU and I/O
  priority), runs one at a time, and does not start while a deploy holds the
  CampusFlow lock or when less than 4 GB of disk is free. A failed PR run posts
  the end of its log as a PR comment, because contributors cannot read the
  server.
* Deploys stay owner-triggered (ADR 017). `ops/ci/server-deploy.sh`, run on the
  server, deploys the head of `main` only if it has a successful `local-verify`,
  using the unchanged `ops/vps/deploy.sh` (backup, migration, rollback, smoke
  checks) inside `node:22`.

This supersedes ADR 017's "nothing is built on the server": the server now
clones the public repository, builds test images, and builds release images for
owner-triggered deploys. Images are still tagged by commit, and deploys still
require a reviewed, green commit on `main`.

The iOS simulator gate (`ios-preview.yml`) needs macOS and is not moved. iOS
simulator acceptance is run by hand on a Mac before a native release.

## Consequences

* Merges no longer depend on GitHub billing or on one maintainer's PC.
* A full run takes longer than on GitHub-hosted runners, and PRs wait in a
  queue of one.
* CI and production share a host. The caps and the disk guard limit the impact,
  but a heavy run can still slow the live API.
* Deploys no longer need Docker or a CA workaround on the owner's PC.
* If GitHub Actions becomes available again, a new ADR can move CI back. The
  pipeline in `scripts/ci-local.sh` can be wrapped in a workflow unchanged.
