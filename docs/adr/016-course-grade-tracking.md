# ADR 016 — Course grade tracking

Status: Accepted. Amended by [ADR 024](024-canvas-grades-and-assessment-groups.md)
(assessment groups and Canvas grade import).

Date: 2026-10-15

## Context

Students want to know where they stand in each course and what they need on the
remaining work. Courses (ADR 015) give a home for that information. Canvas grade
import is unavailable, and an institution's records stay authoritative.

## Decision

Add `assessments` (JSONB, default `[]`) and nullable `targetGrade` (integer
0–100) to `Course`. An assessment is `{ id, title, weight, score }`: weight is a
percentage above 0, score a percentage 0–150 or null until graded, both rounded
to one decimal. At most 30 assessments; their weights may total at most 100%.

Endpoints mirror task steps (ADR 014) under an exclusive course-row lock:
`POST /courses/:id/assessments` (client ID, idempotent retry, conflicting reuse
rejected), `PATCH …/:assessmentId`, `DELETE …/:assessmentId` (retry-safe).
`PATCH /courses/:id` accepts `targetGrade`, including for imported courses.

The arithmetic is a pure domain rule, `gradeSummary`: weighted average over
graded work, floor/ceiling against the actual total weight (so an incomplete
outline is not reported as failing), and the average needed on remaining work
with secured/reachable/unreachable/final status. Grades are presented as the
student's own planning notes.

## Consequences

Letter grades, GPA scales and grade imports are out of scope. Deleting a course
removes its assessments with it.
