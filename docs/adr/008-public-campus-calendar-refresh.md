# ADR 008 — Reviewed public campus calendars

Status: Accepted

Date: 2026-10-10

## Context

Students need real campus listings. Augustana publishes two public Google
calendars through its university recreation programming page. Both exports were
retrieved and validated on 2026-10-10. Their weekly rules require Sunday week starts.

## Decision

- Enable the reviewed source catalog through `CAMPUS_CALENDARS=augustana` in the
  existing API process. Default `disabled` preserves deployment configuration.
  Clients cannot supply feed URLs or initiate network imports. New sources
  require reviewed operator configuration in code.
- Import yesterday through 61 days ahead, exclusive, in the campus timezone.
  Preserve each source event's own IANA zone. Attempt at startup, then check once
  per minute, fetching hourly after success or every 15 minutes after failure.
  A source advisory lock and persisted attempt time throttle all API replicas.
- Add `CampusFeedState` as integration bookkeeping. Persist successful coverage
  and event changes in the same transaction. Failed/incomplete fetches preserve
  event data and successful coverage while recording a failed attempt. Persistence
  errors roll back both records and freshness. No queue is introduced.
- Authenticated `GET /events/sources` returns reviewed public names, organiser
  websites, successful times, coverage and availability. It remains separate
  from Canvas status and the derived Today read model.
- Available means complete coverage refreshed within 90 minutes. Failure,
  expired freshness or missing requested coverage means stale; no success means
  unavailable. Mobile validates/caches records per account and ages freshness.
- Missing saved events retain last known details and explicit plan/reminder
  intent, following the existing preservation policy. Discovery links the
  organiser and explains that plans can change. Disappearance alone is not a
  confirmed cancellation. Unsave still cleans reminder intent.

## Consequences

Deployment needs the additive migration and explicit source setting. API reads
remain independent of external response time. The catalog currently serves
Augustana recreation, not all university events/campuses. Unsupported semantics
invalidate the batch. Saved-event cancellation/archive handling is a separate
improvement. Native acceptance and production deployment remain distinct gates.
