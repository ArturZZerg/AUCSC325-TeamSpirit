import { z } from 'zod';
import { dateSchema, instantSchema } from '@campusflow/contracts';

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
export const academicSnapshotSchema = z.object({ status: z.literal('complete'),
  courses: z.array(normalizedCourse).max(200), academicItems: z.array(normalizedItem).max(2000),
}).strict().superRefine((batch, ctx) => {
  const courses = new Set(batch.courses.map(course => course.externalId));
  if (courses.size !== batch.courses.length || new Set(batch.academicItems.map(item => item.externalId)).size !== batch.academicItems.length
    || batch.academicItems.some(item => !courses.has(item.courseExternalId)))
    ctx.addIssue({ code: 'custom', message: 'Duplicate or unscoped Canvas record' });
});
export type AcademicSnapshot = z.infer<typeof academicSnapshotSchema>;
export abstract class CanvasProvider { abstract fetchAcademicSnapshot(signal: AbortSignal): Promise<AcademicSnapshot>; }

const canvasId = z.number().int().positive().safe();
const sourceInstant = z.string().datetime({ offset: true })
  .refine(value => dateSchema.safeParse(value.slice(0, 10)).success && Number.isFinite(Date.parse(value)), 'Invalid source instant')
  .transform(value => new Date(value).toISOString());
const courseSchema = z.object({ id: canvasId, name: z.string().min(1).max(240), course_code: z.string().max(240).nullable().optional(),
  workflow_state: z.enum(['available', 'completed', 'unpublished', 'deleted']).optional() });
const assignmentSchema = z.object({ id: canvasId, name: z.string().min(1).max(240), due_at: sourceInstant.nullable().optional(),
  submission_types: z.array(z.string()).max(30).optional(),
  submission: z.object({ submitted_at: sourceInstant.nullable().optional(), workflow_state: z.enum(['unsubmitted', 'submitted', 'pending_review', 'graded']).optional(),
    score: z.number().finite().nullable().optional(), missing: z.boolean().optional() }).nullable().optional(),
  has_submitted_submissions: z.boolean().optional(), missing_submissions: z.boolean().optional(),
});
const rawSnapshot = z.object({ courses: z.array(z.object({ course: courseSchema, assignments: z.array(assignmentSchema).max(2000) })).max(200) }).strict();

/** Normalize a complete batch; a malformed record rejects the entire import. */
export function normalizeCanvasSnapshot(input: unknown): AcademicSnapshot {
  const raw = rawSnapshot.parse(input);
  const courses: AcademicSnapshot['courses'] = [], academicItems: AcademicSnapshot['academicItems'] = [];
  for (const { course, assignments } of raw.courses) {
    if (course.workflow_state === 'deleted') continue;
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
  return academicSnapshotSchema.parse({ status: 'complete', courses, academicItems });
}

/** Default until institution-approved backend OAuth is implemented. No HTTP or tokens. */
export class FixtureCanvasProvider extends CanvasProvider {
  async fetchAcademicSnapshot(): Promise<AcademicSnapshot> {
    return normalizeCanvasSnapshot({ courses: [
      { course: { id: 91001, name: 'AUCSC 325 - Software Engineering', course_code: 'AUCSC325', workflow_state: 'available' },
        assignments: [
          { id: 92001, name: 'Architecture decision record', due_at: '2026-10-10T23:59:00.000Z', submission_types: ['online_upload'] },
          { id: 92002, name: 'Canvas integration demo', due_at: '2026-10-17T23:59:00.000Z', submission_types: ['online_text_entry'],
            submission: { submitted_at: '2026-10-02T18:00:00.000Z', workflow_state: 'submitted' } },
        ] },
      { course: { id: 91002, name: 'CMPUT 301 - Introduction to Software Engineering', course_code: 'CMPUT301', workflow_state: 'available' },
        assignments: [{ id: 92003, name: 'Sprint retrospective', due_at: '2026-10-12T16:00:00.000Z', submission_types: ['discussion_topic'] }] },
    ] });
  }
}
