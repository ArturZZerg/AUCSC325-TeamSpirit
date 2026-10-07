# ADR 003 — Student-owned coursework

Status: Accepted for implementation

Date: 2026-10-07

## Context

Students need to track academic deadlines before an institution approves Canvas
OAuth. A personal preparation task and a coursework deadline have different
roles: the former reserves time to study, while the latter records what is due.
The existing AcademicItem model already scopes identity by account and source.

## Decision

Allow students to create AcademicItems with the reserved source `manual` and a
server-generated external identity. Academic endpoints permit title, kind,
optional owned course, deadline, and completion edits only for this source.
Canvas items retain their imported identity and read-only source fields.

For manual items, `unsubmitted` means unfinished and `submitted` means the
student marked the item finished in CampusFlow. The UI uses those plain labels
and explains that this does not submit work to a learning platform. Manual items
cannot claim a grade or a provider-reported missing state. They use the existing
Today composition, offline snapshots, Main Goal and reminder services. Editing
or finishing reconciles reminder intent; deleting removes it transactionally.
App-level mappings expose finished manual work as domain completion, so Today
and the weekly plan show `completed` rather than a claimed Canvas submission.

## Consequences

No new service, database table or migration is needed. Imported course selection
is optional; students without Canvas can add standalone coursework. Creating
manual course groups is a later feature. Records from different sources are
not automatically merged by title. Students should remove a manually tracked
duplicate if they later import the same coursework. PostgreSQL remains
authoritative and writes require a connection.
