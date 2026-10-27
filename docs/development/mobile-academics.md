# Coursework workspace

ToR sections 3.1, 6, 9–10, 13 and 17: students can reach Coursework from Today
or Tasks, filter by course, search assignment/quiz titles and switch between
To do, Finished and All work. The five existing tabs remain unchanged.

The overview groups normalized AcademicItems into Needs attention, Due today,
Next 7 days, Later, No deadline and Finished. Work marked missing and
overdue deadlines require attention; submitted/graded work is finished and never
overdue. Null submission status is labeled unknown rather than fabricated.
Date-only deadlines remain actionable through their whole account-local day.
Shared domain rules handle instants, local dates and daylight-saving boundaries.
Main Goal changes use the existing owned PATCH endpoint and wait for refreshed
state. Imported coursework remains read-only and never offers a Canvas
submission action.

Student-owned coursework is now defined by [ADR 003](../adr/003-manual-coursework.md).
Add coursework opens an account-local deadline editor with an optional imported
course association. Records labeled Added by you can be edited, marked finished,
reopened or deleted after confirmation. Finished means personal progress here;
the Today and weekly read models map it to completion without claiming a Canvas
submission. Imported rows retain their provider state and cannot use these
write endpoints. See [manual coursework](../requirements/manual-coursework.md).

Validated `/academic-items` and `/courses` reads reuse the account-scoped cache.
Read failures retain saved information and expose retry. A validated snapshot
supplies source freshness, not the academic list's completeness. Fixture records
are visibly labeled demo data. Filters and reminder drafts remount on session
change; foreground resume and pull-to-refresh refresh the related reads.

The reminder editor reads the selected item's configuration and offers explicit
relative lead times (none, at deadline, one hour, one day or two days). Other
existing lead times are preserved until the student chooses a replacement.
Saving uses `PUT /academic-items/:id/reminder`; clearing sends null. An unreadable
configuration cannot be overwritten. Pending saves prevent repeat writes and
dismissal, and failures retain the selection for retry.

The existing backend owns scheduling/suppression and reconciliation. Untimed,
finished and inactive-course items retain preference without delivery; changed
deadlines are reconciled after successful sync. The UI explains these limits,
device permissions, category preferences and quiet hours. No schema, provider,
notification scheduler or dependency changes are needed.

Automated evidence: `academic-overview.test.ts`, `academics.test.tsx`,
`academic-reminder-editor.test.tsx`, `academic-queries.test.tsx`, and the Today
navigation regression. Run `npm run check` and the mobile web export. Browser
fixture rendering and native device acceptance are separate forms of evidence;
neither fixtures nor UI tests establish live institutional Canvas authorization.

Local verification on 2026-10-07: the standard `npm run check` passed, including
437 mobile tests, 203 API tests, 33 contract tests, 138 domain tests and three
Android build-script tests. The 124 database-dependent API cases were skipped
locally; hosted CI supplies PostgreSQL. Mobile web export passed. Browser
fixture QA checked search, Finished filtering, reminder selection and Cancel at
320px/390px, plus a 1100px layout; there was no page horizontal overflow.
The temporary preview route was removed before checks/export. No authorized
ADB device was connected, so native interaction/delivery remains unverified.

## Courses

Coursework links to **Courses** (`app/courses.tsx`): students add a course with a
name, optional code and one of eight colours, edit or archive it, and delete it
after confirmation (its coursework stays, with no course). Imported Canvas
courses show their source and accept only a colour. Course colours appear as a
dot beside coursework. Creates reuse their client ID on retry (ADR 015).

## Course grades

Each course opens a detail screen (`app/course/[id].tsx`) with the current
weighted grade, graded share, a target (presets or a custom whole number) and
what average is needed on the remaining work, plus the course's assessments and
coursework. Assessments are added and scored in `assessment-editor.tsx`; weights
and scores accept `30`, `7,5` or `88%`. Calculation: `gradeSummary` in the domain
package (ADR 016).

**What if…** (`grade-what-if.tsx`) lists the ungraded assessments with a score
field each. As the student types, it shows the grade so far and what is still
needed for the target, or the projected final grade and how it compares to the
target once every row has a score. "Fill the rest" enters the average still
needed. Entries stay on the screen and are never sent to the API. A recorded
score always wins over a guess, and values outside 0–150 are flagged and ignored.
Calculation: `whatIfSummary` in the domain package.

## Exams

Manual coursework can be an **Exam** (contracts `kind: 'exam'`; Canvas mapping is
unchanged). Exam study plans default to five revision sessions over up to two
weeks, ending the day before the exam. Today shows **Exams ahead**: unfinished
exams from today through 14 days in the account zone (timed exams drop off once
they start), soonest first, with course code/colour and a countdown that turns
coral within two days (`src/features/exams.ts`, `exam-countdown.tsx`).
