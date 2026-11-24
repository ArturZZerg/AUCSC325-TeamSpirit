# ADR 029 — PC CI runner, and opt-in automatic merge and deploy

Status: Accepted

Date: 2026-11-23

## Context

ADR 028 moved CI to the owner's server. Its test container is capped at 1.5 CPU
and 2 GB because production shares the host, so one full run takes about 20
minutes, and runs go one at a time. Eight open PRs took most of a day to clear,
and every merge then needed someone to run `server-deploy.sh` by hand.
Production had not been deployed for three weeks.

The owner's PC has 16 cores. The serial pipeline used about one of them and
took 13 minutes there.

Passing CI is not the same as being ready. On the day this was decided, two
green PRs were held in review: one fix was incomplete, and on another a
teammate had requested changes. Merging every green PR would have shipped both.

## Decision

### Testing: the PC when it is on, the server otherwise

* `scripts/pc-ci.sh` runs on the owner's PC. It takes work from the same queue
  as the server (`scripts/ci-queue.sh`) and runs `scripts/ci-local.sh` with
  `CI_PARALLEL=1`. It posts the same `local-verify` status, so branch protection
  is unchanged. PR code runs only in Docker, under the same trust rules as the
  server (collaborators, or a maintainer's `ci:run`).
* While it runs, it touches a heartbeat on the server. The server then stops
  testing and only merges and deploys. Within five minutes of the PC runner
  stopping, the server tests again, so nothing depends on the PC.
* The parallel mode runs lint, typechecks, every workspace's tests and the
  builds at the same time, with mobile Jest on half the cores. The server
  keeps the serial mode. Both run every step.
* Both modes reuse caches: the npm download cache (Docker volume; npm still
  checks every package against the lockfile hashes), a CI image with the
  PostgreSQL 17 client, and the API image's `npm ci` layer, which the
  Dockerfile now rebuilds only when a manifest or the lockfile changes.
* A PR that changes only Markdown or files under `docs/` passes without
  running the steps: none of them read those files.
* A passing PR's status records the `main` it was merged into (`main=<sha>`).

### Merging and deploying: opt-in, on the server

* `ops/ci/server-ci.sh` merges a PR (merge commit) on every tick when it has
  the `automerge` label, added by someone with admin or maintain permission
  (triage and write access can also add labels), its latest `local-verify`
  passed on the current `main` (from either runner), and no reviewer's latest
  review requests changes.
  An `automerge` PR that passed on an older `main` is queued for a fresh run
  first. If GitHub refuses the merge (branch protection), the reason is posted.
* `main` can still move between that check and the merge. So CI marks GitHub's
  merge commit verified only when it has exactly the tree that was tested and
  is still the head of `main`; any other merge waits for a green run of `main`,
  which is then the gate for the deploy.
* Merged PRs are queued and deployed with `server-deploy.sh`, so the deploy
  keeps its backup, migration, rollback and smoke-test steps. It runs as its
  own systemd unit (`campusflow-deploy`, its own 60-minute limit, log
  `/var/log/campusflow-deploy.log`), so a CI time-out cannot stop it partway,
  and it holds the CI lock so no test runs beside it. A deploy deploys
  whatever `main` contains, including PRs merged by hand.
* Every deploy, automatic or by hand, tells the queued PRs whether it went
  live or failed and clears the queue. A refused deploy (`main` not verified
  yet) keeps the queue for the next tick. When `main` fails, the queued PRs are
  told once that the deploy is held.
* Failing PRs keep getting the end of the log as a comment (ADR 028).
* PRs without the label are tested, then merged and deployed by hand.

## Consequences

* Adding `automerge` means "ship this once CI passes". It only works when a
  maintainer adds it, and there is no separate approval step: a maintainer who
  labels their own PR ships it.
* The CI token needs Contents read and write to merge.
* With the PC runner on, a labelled PR reaches production in about one
  parallel run plus a deploy; on the server alone, about one 20-minute run
  plus a deploy. Only a merge whose code differs from the tested merge waits
  for another `main` run.
* Statuses posted from the PC are posted as the owner (gh sign-in), from the
  server as the CI token.
* ADR 017's owner-triggered deploy remains available and is unchanged.
