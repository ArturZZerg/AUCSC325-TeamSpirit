# Changelog

## Unreleased

- api/ops: synthetic demo account (`demo@example.com`) seeded through the public
  API with courses, grades, classes, coursework, a study plan, tasks, routines,
  journal entries and a saved campus event, reset nightly.

- ops: API deployed to the owner's server with `deploy.sh`, daily read-back-checked
  backups (`backup.sh`, restore rehearsed once) and a 5-minute readiness watchdog
  (`healthcheck.sh`).

- docs: production audit (`STATE`, `PRODUCT`, `COMPETITORS`, `APIS`, `ROADMAP`,
  `QUESTIONS`) and ADR 017 for owner-authorized deployment.

Earlier history: see merged pull requests and
[the MVP roadmap](development/mvp-roadmap.md).
