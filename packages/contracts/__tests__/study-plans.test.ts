import { createStudyPlanSchema, studyPlanSchema, updateStudyPlanSchema } from '../src';
const body = { requestKey: 'study-contract-key-1', academicItemId: '10000000-0000-4000-8000-000000000001', title: ' Revision ',
  sessions: [{ title: ' Recall ', scheduled: { kind: 'date', date: '2025-03-09' }, estimatedMinutes: 50 }] };
it('accepts and trims a finite preparation plan', () => { expect(createStudyPlanSchema.parse(body)).toMatchObject({ title: 'Revision', sessions: [{ title: 'Recall' }] }); });
it('accepts exact UTC study starts and up to twelve sessions', () => {
  expect(createStudyPlanSchema.safeParse({ ...body, sessions: Array.from({ length: 12 }, () => ({ ...body.sessions[0], scheduled: { kind: 'instant', at: '2025-03-09T17:00:00Z' } })) }).success).toBe(true);
});
it.each([{ requestKey: 'short' }, { requestKey: 'request key with spaces' }, { academicItemId: 'foreign' }, { title: ' ' }, { userId: body.academicItemId },
  { sessions: [] }, { sessions: Array.from({ length: 13 }, () => body.sessions[0]) },
  ...[{ title: '' }, { estimatedMinutes: 0 }, { estimatedMinutes: 181 }, { estimatedMinutes: 2.5 }, { recurrence: { frequency: 'daily' } },
    { scheduled: { kind: 'date', date: '2025-02-30' } }, { scheduled: { kind: 'instant', at: '2025-03-09T10:00:00-07:00' } }].map(override => ({ sessions: [{ ...body.sessions[0], ...override }] })),
])('rejects malformed/private/recurring input %j', override => { expect(createStudyPlanSchema.safeParse({ ...body, ...override }).success).toBe(false); });
it.each([{}, { title: ' ' }, { archived: 'true' }, { userId: body.academicItemId }, { tasks: [] }])('rejects invalid metadata mutations %j', value => {
  expect(updateStudyPlanSchema.safeParse(value).success).toBe(false);
});
it('accepts explicit rename, archive and restore values', () => {
  expect(updateStudyPlanSchema.parse({ title: ' Review ', archived: false })).toEqual({ title: 'Review', archived: false });
  expect(updateStudyPlanSchema.parse({ archived: true })).toEqual({ archived: true });
});
const id = body.academicItemId, stamp = '2025-03-08T00:00:00Z';
const task = { id, studyPlanId: id, title: 'Recall', description: null, category: 'university', priority: 'medium', due: null, scheduled: null,
  recurrence: null, reminder: null, estimatedMinutes: null, completedAt: null, snoozedUntil: null, mainGoalDate: null, createdAt: stamp, updatedAt: stamp };
const plan = { id, title: 'Plan', academicItemId: null, academicItem: null, deadlineWhenPlanned: null, createdAt: stamp, tasks: [task] };
it('validates membership and supports older cached plan metadata', () => {
  expect(studyPlanSchema.safeParse(plan).success).toBe(true);
  for (const override of [{ tasks: [{ ...task, studyPlanId: null }] }, { tasks: [task, task] }, { tasks: [{ ...task, recurrence: { frequency: 'daily' } }] },
    { academicItemId: id, academicItem: null }]) expect(studyPlanSchema.safeParse({ ...plan, ...override }).success).toBe(false);
});
