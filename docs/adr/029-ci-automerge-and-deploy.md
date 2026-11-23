# ADR 029 — Opt-in automatic merge and deploy from server CI

Status: Accepted

Date: 2026-11-23

## Context

ADR 028 moved CI to the owner's server and kept deploys owner-triggered. Every
green PR still waited for someone to merge it, check `main`, and run
`server-deploy.sh` by hand. The owner asked for green PRs to merge and deploy
themselves.

Passing CI is not the same as being ready. On the day this was decided, two
green PRs were held in review: one fix was incomplete, and on another a
teammate had requested changes. Merging every green PR would have shipped both.

## Decision

Automatic merge is opt-in per PR, through the `automerge` label.

* After a PR passes, `ops/ci/server-ci.sh` merges it (merge commit) when it has
  the `automerge` label and all of these hold:
  * its head is still the commit that was tested;
  * `main` is still the commit the tested merge was built on. Otherwise CI adds
    `ci:run`, so the PR is re-tested against the new `main` first;
  * no reviewer's latest review requests changes.
  If GitHub refuses the merge (branch protection), the reason is posted on the PR.
* A merged PR is queued for deployment. The next green run of `main` (tested
  first after every merge) deploys that exact commit with `server-deploy.sh`,
  so the deploy keeps its backup, migration, rollback and smoke-test steps.
  The PR gets a comment when it is deployed, when the deploy fails, or when
  `main` fails and the deploy is held.
* Failing PRs keep getting the end of the log as a comment (ADR 028).
* PRs without the label behave as before: they are tested, then merged and
  deployed by hand.

## Consequences

* Adding `automerge` means "ship this once CI passes". Only maintainers can add
  labels, and fork PRs still need `ci:run` before any code runs.
* The CI token needs Contents read and write to merge.
* A merge waits for its PR run and then a `main` run (about 20 minutes each on
  the capped server) before it reaches production.
* ADR 017's owner-triggered deploy remains available and is unchanged.
