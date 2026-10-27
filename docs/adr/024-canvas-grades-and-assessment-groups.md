# ADR 024 — Canvas grades and assessment groups

Status: Accepted

Date: 2026-10-27

## Context

ADR 016 stores a course's grade outline as a flat list of assessments whose
weights are percents of the course, entered by hand. ADR 019 connects Canvas
with a personal access token, and the assignment fetch already returns each
student's score, but scores were dropped and grade import was out of scope.

Real course outlines and Canvas courses group work: "Quizzes 20%" holds many
quizzes that split that 20% by points. Canvas either weights its assignment
groups (`apply_assignment_group_weights`) or grades the whole course by points.
Students also need to adjust weights when Canvas doesn't match their outline,
for example a dropped quiz or an instructor who never set group weights.

## Decision

- `Course` gets `assessmentGroups` (JSONB, default `[]`) next to `assessments`.
  A group is `{ id, title, weight, canvas? }`; `weight` is a percent of the course
  or null for "by points".
- An assessment gains optional `groupId` and `canvas`. Ungrouped, `weight` stays
  a percent of the course (above 0, at most 100). In a group it is the
  assessment's share of that group (up to 10,000, so points work), and 0 leaves
  it out of the grade.
- Grade math stays in `packages/domain`. `courseWeights` converts groups to
  course weights: a weighted group splits its weight by share, and null-weight
  groups together split what ungrouped assessments and weighted groups leave of
  100%, by share. That matches an unweighted Canvas course and lets a student mix
  their own "Participation 10%" with Canvas points. Floor, ceiling, needed and
  what-if run on these weights unchanged. `current` is computed the way Canvas
  reports it: each group is averaged over its own graded work, then groups with
  grades are combined by weight. Courses without groups behave exactly as before.
- Canvas sync reads `/courses/:id/assignment_groups` and, per assignment,
  `points_possible`, `assignment_group_id`, `omit_from_final_grade`, grading type
  and the student's `excused` flag. Work that is excused, ungraded, worth 0 points
  or omitted from the final grade is not an assessment (it stays coursework).
  Scores become percents of points possible, capped at 150%. An assignment whose
  group can't be read goes into an "Other Canvas work" group graded by points.
- `mergeCanvasGrades` updates the course's Canvas rows inside the existing sync
  transaction, under the course row lock that the assessment endpoints also take.
  Canvas sets titles, scores, groups and default weights (points possible, Canvas
  group weight). A weight the student changed is marked `weightEdited` and kept
  until they reset it. Rows the student added are never touched. A Canvas row
  missing from a complete read of the course was removed in Canvas and is
  dropped; after a partial read (more pages, unreadable rows, the 2,000-item cap)
  nothing is removed. A Canvas group the student still uses is kept. Unchanged
  data writes nothing.
- Endpoints: `POST/PATCH/DELETE /courses/:id/assessment-groups[/:groupId]`, and
  assessments accept `groupId`. Canvas rows accept only `weight` or
  `resetWeight: true` and can't be deleted; Canvas groups can't be renamed or
  deleted. Weighted groups count toward the 100% limit. Canvas can import weights
  above 100%, so an edit is refused only when it would raise a total already
  above 100%. A group must be empty to delete. Students may add up to 30
  assessments; Canvas may bring a course to 430 assessments and 40 groups.

## Consequences

Canvas scores appear in the course grade, what-if and course list without a
separate Canvas grade entity. Assignment deadlines and grade parts stay separate
records (`AcademicItem` and the course outline) mapped from the same Canvas
assignment. Canvas features such as drop-lowest rules, "never drop" lists and
muted or unposted scores are not modelled; an unposted score reads as not
graded. Letter grades and GPA remain out of scope. Fixture mode imports groups
and points without scores so the demo shows grouped weights.
