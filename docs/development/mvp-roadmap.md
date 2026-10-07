# MVP product roadmap

The next development slices prioritize useful student workflows. Common planner
patterns in MyStudyLife informed the choice of a weekly overview and a dedicated
coursework workspace; CampusFlow retains its existing native components, moss/sage
palette and Today-centered product model.

1. **Weekly planner:** Monday–Sunday workload overview, per-day agenda, honest
   offline coverage and navigation into Today. Implemented in the planner slice.
2. **Academic workspace:** course filters, search, deadline groups, submission
   states, Main Goal selection and configurable deadline reminders. Use the
   existing authenticated academic/course/reminder APIs; no schema change needed.
   Implemented in the [Coursework slice](mobile-academics.md).
3. **Study focus:** a timer linked to planned work, with pause/resume and useful
   session history. Design session ownership/persistence before implementing.
4. **First-use onboarding:** help a student create their first task, choose a
   routine and understand optional academic connections with clear empty states.

Each slice gets a branch, behavior tests, lint/typecheck/build/web export,
responsive visual checks, self-review, hosted CI and a reviewed merge. Native
acceptance remains a separate gate for new interactions. Temporary browser
fixtures and preview entry points never ship in the production application.

Commercial-release gates remain: institution-approved live Canvas OAuth and
an authorized integration test, a verified campus feed, production hosting/TLS,
account recovery, and iOS/Android acceptance. Feature development can continue
against existing provider boundaries while these external gates are pending.
