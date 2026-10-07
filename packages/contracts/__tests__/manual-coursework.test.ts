import { createManualAcademicItemSchema, updateManualAcademicItemSchema } from '../src';

it('accepts standalone date-only coursework and trims the title', () => {
  expect(createManualAcademicItemSchema.parse({ title: '  Essay  ', kind: 'assignment', due: { kind: 'date', date: '2028-02-29' } })).toEqual({ title: 'Essay', kind: 'assignment', due: { kind: 'date', date: '2028-02-29' } });
});
it.each([{ title: ' ', kind: 'quiz' }, { title: 'a'.repeat(241), kind: 'quiz' }, { title: 'Quiz', kind: 'exam' },
  { title: 'Quiz', kind: 'quiz', source: 'canvas:fixture' }, { title: 'Quiz', kind: 'quiz', userId: 'owner' },
  { title: 'Quiz', kind: 'quiz', externalId: 'injected' }, { title: 'Quiz', kind: 'quiz', courseId: 'invalid' },
  { title: 'Quiz', kind: 'quiz', due: { kind: 'date', date: '2027-02-29' } },
  { title: 'Quiz', kind: 'quiz', due: { kind: 'instant', at: '2026-10-07T13:00:00-06:00' } }])('rejects invalid or source-owned create fields %j', body => {
  expect(createManualAcademicItemSchema.safeParse(body).success).toBe(false);
});
it.each([{}, { title: undefined }, { submissionState: 'graded' }, { submissionState: 'missing' }, { source: 'manual' }, { reminderLeadMinutes: 60 }])('rejects invalid manual edits %j', body => {
  expect(updateManualAcademicItemSchema.safeParse(body).success).toBe(false);
});
it('supports finishing, reopening and clearing optional fields', () => {
  for (const submissionState of ['submitted', 'unsubmitted']) expect(updateManualAcademicItemSchema.parse({ submissionState, due: null, courseId: null })).toEqual({ submissionState, due: null, courseId: null });
});
