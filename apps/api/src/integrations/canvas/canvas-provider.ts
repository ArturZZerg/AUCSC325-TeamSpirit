import { z } from 'zod';
import { assessmentGroupLimit, dateSchema, groupedWeightMax, instantSchema } from '@campusflow/contracts';

// Provider payloads and normalized import records stay within the API.
const externalId = z.string().min(1).max(100);
const utcInstant = instantSchema.refine(value => dateSchema.safeParse(value.slice(0, 10)).success, 'Invalid calendar date')
  .transform(value => new Date(value).toISOString());
const normalizedCourse = z.object({ externalId, name: z.string().min(1).max(240), code: z.string().max(240).nullable(), active: z.boolean() }).strict();
const normalizedItem = z.object({ externalId, courseExternalId: externalId, title: z.string().min(1).max(240),
  kind: z.enum(['assignment', 'quiz', 'discussion']),
  due: z.object({ kind: z.literal('instant'), at: utcInstant }).strict().nullable(),
  submissionState: z.enum(['graded', 'submitted', 'missing', 'unsubmitted']),
}).strict();
// Grade data per course (ADR 024). `complete` means every assignment and group
// was read, so a Canvas assessment missing from it was removed in Canvas.
const gradeGroup = z.object({ externalId, name: z.string().min(1).max(240), weight: z.number().min(0).max(100).nullable() }).strict();
const gradeItem = z.object({ externalId, title: z.string().min(1).max(240), groupExternalId: externalId,
  pointsPossible: z.number().positive().max(groupedWeightMax), score: z.number().min(0).max(150).nullable() }).strict();
const courseGrades = z.object({ courseExternalId: externalId, complete: z.boolean(), groups: z.array(gradeGroup).max(assessmentGroupLimit),
  items: z.array(gradeItem).max(400) }).strict();
export type CanvasCourseGrades = z.infer<typeof courseGrades>;
export const academicSnapshotSchema = z.object({ status: z.literal('complete'),
  courses: z.array(normalizedCourse).max(200), academicItems: z.array(normalizedItem).max(2000), grades: z.array(courseGrades).max(200).optional(),
}).strict().superRefine((batch, ctx) => {
  const courses = new Set(batch.courses.map(course => course.externalId));
  if (courses.size !== batch.courses.length || new Set(batch.academicItems.map(item => item.externalId)).size !== batch.academicItems.length
    || batch.academicItems.some(item => !courses.has(item.courseExternalId)))
    ctx.addIssue({ code: 'custom', message: 'Duplicate or unscoped Canvas record' });
  const graded = new Set<string>();
  for (const entry of batch.grades ?? []) {
    const groups = new Set(entry.groups.map(group => group.externalId));
    if (!courses.has(entry.courseExternalId) || graded.has(entry.courseExternalId) || groups.size !== entry.groups.length
      || new Set(entry.items.map(item => item.externalId)).size !== entry.items.length || entry.items.some(item => !groups.has(item.groupExternalId)))
      ctx.addIssue({ code: 'custom', message: 'Duplicate or unscoped Canvas grade record' });
    graded.add(entry.courseExternalId);
  }
});
export type AcademicSnapshot = z.infer<typeof academicSnapshotSchema>;
export abstract class CanvasProvider { abstract fetchAcademicSnapshot(signal: AbortSignal): Promise<AcademicSnapshot>; }

const canvasId = z.number().int().positive().safe();
const sourceInstant = z.string().datetime({ offset: true })
  .refine(value => dateSchema.safeParse(value.slice(0, 10)).success && Number.isFinite(Date.parse(value)), 'Invalid source instant')
  .transform(value => new Date(value).toISOString());
const courseSchema = z.object({ id: canvasId, name: z.string().min(1).max(240), course_code: z.string().max(240).nullable().optional(),
  workflow_state: z.enum(['available', 'completed', 'unpublished', 'deleted']).optional(), apply_assignment_group_weights: z.boolean().optional() });
const assignmentSchema = z.object({ id: canvasId, name: z.string().min(1).max(240), due_at: sourceInstant.nullable().optional(),
  submission_types: z.array(z.string()).max(30).optional(),
  submission: z.object({ submitted_at: sourceInstant.nullable().optional(), workflow_state: z.enum(['unsubmitted', 'submitted', 'pending_review', 'graded']).optional(),
    score: z.number().finite().nullable().optional(), missing: z.boolean().optional(), excused: z.boolean().optional() }).nullable().optional(),
  has_submitted_submissions: z.boolean().optional(), missing_submissions: z.boolean().optional(),
  points_possible: z.number().finite().nullable().optional(), assignment_group_id: canvasId.nullable().optional(),
  omit_from_final_grade: z.boolean().optional(), grading_type: z.string().max(40).optional(),
});
const assignmentGroupSchema = z.object({ id: canvasId, name: z.string().min(1).max(240), group_weight: z.number().finite().nullable().optional() });
// `assignment_groups` present means grades were read for that course; `complete` that nothing was cut off.
const rawSnapshot = z.object({ courses: z.array(z.object({ course: courseSchema, assignments: z.array(assignmentSchema).max(2000),
  assignment_groups: z.array(assignmentGroupSchema).max(100).optional(), complete: z.boolean().optional() })).max(200) }).strict();
type RawCourse = z.infer<typeof rawSnapshot>['courses'][number];
/** Assignments whose group wasn't readable are pooled here by points. */
export const otherGroupExternalId = 'other';

/**
 * Canvas assignments that count toward the course grade, with the student's
 * score as a percent. Excused, ungraded, zero-point and omitted work is left out.
 */
function normalizeGrades({ course, assignments, assignment_groups: canvasGroups, complete }: RawCourse): CanvasCourseGrades | null {
  if (!canvasGroups) return null;
  // Canvas applies group weights only when the course turns them on; otherwise it grades by points.
  const weighted = course.apply_assignment_group_weights === true;
  const groups: CanvasCourseGrades['groups'] = canvasGroups.slice(0, assessmentGroupLimit - 1).map(group => ({ externalId: String(group.id), name: group.name,
    weight: weighted ? Math.min(100, Math.max(0, Math.round((group.group_weight ?? 0) * 10) / 10)) : null }));
  const known = new Set(groups.map(group => group.externalId));
  const items: CanvasCourseGrades['items'] = [];
  for (const assignment of assignments) {
    const points = assignment.points_possible;
    if (!points || points <= 0 || assignment.omit_from_final_grade || assignment.grading_type === 'not_graded' || assignment.submission?.excused) continue;
    const group = assignment.assignment_group_id != null && known.has(String(assignment.assignment_group_id)) ? String(assignment.assignment_group_id) : otherGroupExternalId;
    const score = assignment.submission?.score;
    items.push({ externalId: String(assignment.id), title: assignment.name, groupExternalId: group, pointsPossible: Math.min(points, groupedWeightMax),
      score: score == null ? null : Math.min(150, Math.max(0, Math.round(score / points * 1000) / 10)) });
  }
  if (items.some(item => item.groupExternalId === otherGroupExternalId)) groups.push({ externalId: otherGroupExternalId, name: 'Other Canvas work', weight: null });
  return { courseExternalId: String(course.id), complete: complete === true && canvasGroups.length === groups.filter(group => group.externalId !== otherGroupExternalId).length,
    groups, items: items.slice(0, 400) };
}

/** Normalize a complete batch; a malformed record rejects the entire import. */
export function normalizeCanvasSnapshot(input: unknown): AcademicSnapshot {
  const raw = rawSnapshot.parse(input);
  const courses: AcademicSnapshot['courses'] = [], academicItems: AcademicSnapshot['academicItems'] = [], grades: CanvasCourseGrades[] = [];
  for (const entry of raw.courses) {
    const { course, assignments } = entry;
    if (course.workflow_state === 'deleted') continue;
    const courseGrade = normalizeGrades(entry);
    if (courseGrade) grades.push(courseGrade);
    const courseExternalId = String(course.id);
    courses.push({ externalId: courseExternalId, name: course.name, code: course.course_code ?? null,
      active: course.workflow_state !== 'completed' });
    for (const assignment of assignments) {
      const submission = assignment.submission;
      // Use the current student's submission, never an assignment-wide aggregate.
      const submissionState = submission?.workflow_state === 'graded' || submission?.score != null ? 'graded'
        : submission?.submitted_at || ['submitted', 'pending_review'].includes(submission?.workflow_state ?? '') ? 'submitted'
          : submission?.missing ? 'missing' : 'unsubmitted';
      academicItems.push({ externalId: String(assignment.id), courseExternalId, title: assignment.name,
        kind: assignment.submission_types?.includes('discussion_topic') ? 'discussion'
          : assignment.submission_types?.includes('online_quiz') ? 'quiz' : 'assignment',
        due: assignment.due_at ? { kind: 'instant', at: assignment.due_at } : null, submissionState });
    }
  }
  return academicSnapshotSchema.parse({ status: 'complete', courses, academicItems, ...(grades.length ? { grades } : {}) });
}

/** Default until institution-approved backend OAuth is implemented. No HTTP or tokens. */
export class FixtureCanvasProvider extends CanvasProvider {
  async fetchAcademicSnapshot(): Promise<AcademicSnapshot> {
    return normalizeCanvasSnapshot({ courses: [
      { course: { id: 91001, name: 'AUCSC 325 - Software Engineering', course_code: 'AUCSC325', workflow_state: 'available', apply_assignment_group_weights: true },
        assignments: [
          { id: 92001, name: 'Architecture decision record', due_at: '2026-10-10T23:59:00.000Z', submission_types: ['online_upload'],
            points_possible: 20, assignment_group_id: 93001 },
          { id: 92002, name: 'Canvas integration demo', due_at: '2026-10-17T23:59:00.000Z', submission_types: ['online_text_entry'],
            points_possible: 30, assignment_group_id: 93002, submission: { submitted_at: '2026-10-02T18:00:00.000Z', workflow_state: 'submitted' } },
        ],
        assignment_groups: [{ id: 93001, name: 'Assignments', group_weight: 60 }, { id: 93002, name: 'Project', group_weight: 40 }], complete: true },
      { course: { id: 91002, name: 'CMPUT 301 - Introduction to Software Engineering', course_code: 'CMPUT301', workflow_state: 'available' },
        assignments: [{ id: 92003, name: 'Sprint retrospective', due_at: '2026-10-12T16:00:00.000Z', submission_types: ['discussion_topic'] }] },
    ] });
  }
}
