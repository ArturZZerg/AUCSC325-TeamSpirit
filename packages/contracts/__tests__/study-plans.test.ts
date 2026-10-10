import { createStudyPlanSchema } from '../src';
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
