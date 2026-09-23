import { createPersonalTaskSchema, registerRequestSchema, todayResponseSchema } from '../src';

describe('public contract validation', () => {
  it('keeps date-only and timed task values unambiguous', () => {
    expect(createPersonalTaskSchema.parse({ title: 'Buy groceries', due: { kind: 'date', date: '2026-09-21' } }).due).toEqual({ kind: 'date', date: '2026-09-21' });
    expect(createPersonalTaskSchema.safeParse({ title: 'Broken', due: { date: '2026-09-21' } }).success).toBe(false);
  });
  it('requires an IANA timezone field at the auth boundary', () => {
    expect(registerRequestSchema.safeParse({ email: 'student@example.ca', password: 'short', displayName: 'Student', timeZone: 'America/Edmonton' }).success).toBe(false);
  });
  it('requires a source freshness status in Today responses', () => {
    expect(todayResponseSchema.safeParse({ date: '2026-09-21', timeZone: 'America/Edmonton', generatedAt: '2026-09-21T12:00:00Z', items: [], upcoming: [], campusEvents: [] }).success).toBe(false);
  });
});
