import { eventQuerySchema, completePersonalTaskSchema, dateSchema, taskQuerySchema, pauseGoalSchema, updatePersonalTaskSchema, snapshotCoverageSchema, offlineSnapshotSchema, createPersonalTaskSchema, registerRequestSchema, todayResponseSchema } from '../src';

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

describe('core request and snapshot boundaries', () => {
  it.each(['2026-02-29', '2026-13-01', '2026-00-01', '2026-04-31', 'not-a-date'])('rejects invalid date %s', date => {
    expect(dateSchema.safeParse(date).success).toBe(false);
    expect(completePersonalTaskSchema.safeParse({ completed: true, occurrenceKey: date }).success).toBe(false);
  });
  it('accepts a leap day and rejects invalid task filters', () => {
    expect(dateSchema.parse('2028-02-29')).toBe('2028-02-29');
    expect(taskQuerySchema.parse({ completed: 'false', category: 'personal', search: ' Study ' })).toEqual({ completed: 'false', category: 'personal', search: 'Study' });
    for (const query of [{ completed: 'yes' }, { category: 'unknown' }, { search: ['a', 'b'] }, { userId: 'other' }]) {
      expect(taskQuerySchema.safeParse(query).success).toBe(false);
    }
  });
  it('requires an explicit boolean pause state', () => {
    expect(pauseGoalSchema.parse({ paused: false })).toEqual({ paused: false });
    for (const body of [{}, { paused: 'false' }, { paused: null }, { paused: true, extra: 1 }]) expect(pauseGoalSchema.safeParse(body).success).toBe(false);
  });
  it('distinguishes omitted fields from clearing nullable fields', () => {
    expect(updatePersonalTaskSchema.parse({})).toEqual({});
    expect(updatePersonalTaskSchema.parse({ due: null, description: null })).toEqual({ due: null, description: null });
    expect(updatePersonalTaskSchema.safeParse({ title: null }).success).toBe(false);
    expect(updatePersonalTaskSchema.safeParse({ mainGoalDate: '2026-03-08' }).success).toBe(false);
  });
  it('requires explicit persisted coverage and rejects backwards windows', () => {
    expect(snapshotCoverageSchema.safeParse({ from: '2026-03-09', through: '2026-03-08', basis: 'persisted', includesOverdue: true }).success).toBe(false);
    expect(snapshotCoverageSchema.parse({ from: '2026-03-08', through: '2026-03-15', basis: 'persisted', includesOverdue: true }).through).toBe('2026-03-15');
    expect(offlineSnapshotSchema.safeParse({}).success).toBe(false);
  });
});

describe('event range query boundary', () => {
  it.each(['2026-02-30', '2026-02-30T12:00:00Z', 'yesterday', '2026-03-08T09:00:00'])('rejects invalid boundary %s', from => {
    expect(eventQuerySchema.safeParse({ from }).success).toBe(false);
  });
  it('accepts date and UTC boundaries with free-text source categories', () => {
    expect(eventQuerySchema.parse({ from: '2026-03-08', through: '2026-03-09T06:00:00Z', category: 'lecture' })).toEqual({ from: '2026-03-08', through: '2026-03-09T06:00:00Z', category: 'lecture' });
  });
  it('rejects duplicate and unknown query parameters', () => {
    expect(eventQuerySchema.safeParse({ from: ['2026-03-08', '2026-03-09'] }).success).toBe(false);
    expect(eventQuerySchema.safeParse({ sourceScope: 'public' }).success).toBe(false);
  });
});
