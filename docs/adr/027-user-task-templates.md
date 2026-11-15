# ADR 027 - User-defined task templates

Status: Accepted (host-approved feature proposal)

Date: 2026-11-14

## Decision

Store templates per account in PostgreSQL through authenticated
/task-templates routes in the API. A separate TaskTemplate model belongs to
User, with cascading deletion. Templates never appear in Today themselves.

Reuse task schemas for title (1-240 characters), description (up to 10,000),
and estimate (1-1440 whole minutes). Reuse checklist title validation and
checklistLimit (30). A template stores ordered step titles without completion
state or task step IDs.

Using a template copies its values into the existing task editor for review.
Tasks do not retain a template reference. Later edits or deletion of a template
cannot affect a created task.

Extend task creation with optional checklist steps, saved atomically with the
task. This avoids partially created tasks if subsequent step requests fail.
Steps receive new IDs and start incomplete. Template-based saves use the
existing request-key mechanism to prevent duplicate unchanged retries.
Explain this host-permitted create-request extension in the PR description.

The mobile list uses the existing account-scoped query/cache mechanism.
Editing reuses the template form. Deletion requires confirmation and removes
only the owned template. Duplication opens a copied template draft named
"Copy of ..." for review and uses the existing POST route, without an
additional endpoint. Its default title stays within the shared title limit.
