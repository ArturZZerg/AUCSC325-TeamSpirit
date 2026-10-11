# Student workload inbox

Extends ToR 3.2, 4, 7 and the preparation workflow under ADR 005. Today and the
weekly planner open a single workspace for choosing the next useful action.
The inbox derives from validated account-scoped tasks, coursework and study plans.
No new entity, persistence, service or dependency is introduced.

Each open one-off task appears once: Needs attention for overdue deadlines or
elapsed sessions; No time set for unscheduled work; Today for chosen current-day
or still-running sessions; Later for future scheduled work. Date-only deadlines
remain open until the account's local day ends. Timed sessions become earlier
after their estimated end; an absent estimate does not invent a duration.
Snoozed tasks return when the snooze expires, while overdue deadlines remain
visible. Repeating tasks link to Today, which owns occurrence completion state.
The Today view also includes work due today and the chosen Main Goal, even before
scheduling or preparation. Each record appears once within the selected view.

The task list owns membership and current values. Older embedded study-plan
tasks cannot resurrect deleted sessions or overwrite newer completion. Linked
sessions retain their plan label and archive state; they are not duplicated as
unrelated tasks. Estimates remain separate from recorded focus time.

Submitted/graded coursework is excluded. Missing or overdue coursework needs
attention; open coursework without known preparation offers a reviewed plan.
Known finished or archived preparation links to that group instead of offering
duplicate creation. Missing, saved, failed or refreshing plan reads cannot prove
absence: refresh before offering preparation creation. Imported academic state
reflects the last successful sync and is not changed by preparation completion.

To organise / Today / Later views and title/category/plan search preserve entity
identity. Counts include available reads; missing totals show a dash and unknown
reads do not claim an empty workload. Loading, unavailable, partial, saved and
confirmed empty states are distinct. Minute ticks, local midnight and foreground
resume update grouping; foreground resume also refreshes account reads.

Schedule/edit uses TaskEditor; focus targets the exact task; preparation creation
uses the explicit preview and retry-safe editor. A planId link opens the exact
preparation group with sessions expanded, including archived and finished groups.
Malformed or missing links offer browse/refresh without claiming deletion.
Search and view choices leave the targeted view and remain under student control.
Account/session changes discard private search, view and editor drafts.
Focus navigation preserves an existing running/recovered block. The requested
task stays visible as an explicit next choice, enabled after that block is settled;
navigation never discards or replaces unsaved focus work automatically.

Validation: workload grouping tests cover historical DST boundaries, midnight,
date-only/undated work, completion, snooze, recurrence, deleted/edited membership,
archived/finished plans and uncertain reads. Interaction tests cover selected
task focus/edit, failed/pending schedule saves, explicit preparation save,
targeted plan links, partial/error states, refresh and account isolation. Validate
root checks, production web export, real API/cache flows and responsive layout.
Native interaction remains a separate device acceptance gate.
