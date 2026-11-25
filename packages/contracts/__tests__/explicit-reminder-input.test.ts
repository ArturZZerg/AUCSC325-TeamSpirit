import { createGoalSchema, createPersonalTaskRequestSchema, createPersonalTaskSchema, offlineSnapshotSchema, updateGoalSchema, updatePersonalTaskSchema } from '../src';

const task = { title: 'Read' };
const goal = { title: 'Walk', schedule: { kind: 'daily' }, timeZone: 'America/Edmonton' };
const writes = [
  { name: 'task create', schema: createPersonalTaskSchema, body: task },
  { name: 'task create request', schema: createPersonalTaskRequestSchema, body: task },
  { name: 'task update', schema: updatePersonalTaskSchema, body: {} },
  { name: 'goal create', schema: createGoalSchema, body: goal },
  { name: 'goal update', schema: updateGoalSchema, body: {} },
];

describe('explicit reminder write boundaries (ToR 7, 13; #190)', () => {
  it.each(writes)('rejects a date-only reminder on $name', ({ schema, body }) => {
    const result = schema.safeParse({ ...body, reminder: { kind: 'date', date: '2030-03-10' } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === 'reminder')).toBe(true);
  });

  it.each(writes)('preserves omitted reminders and explicit clearing on $name', ({ schema, body }) => {
    expect(schema.parse(body)).not.toHaveProperty('reminder');
    expect(schema.parse({ ...body, reminder: null })).toMatchObject({ reminder: null });
  });

  it.each(writes)('accepts precise UTC reminders across midnight and DST on $name', ({ schema, body }) => {
    for (const at of ['2030-03-10T00:00:00Z', '2030-03-10T08:59:59.123Z', '2030-03-10T09:00:00Z', '2030-11-03T07:30:12.345Z', '2030-11-03T08:30:12.345Z']) {
      expect(schema.parse({ ...body, reminder: { kind: 'instant', at } })).toMatchObject({ reminder: { kind: 'instant', at } });
    }
    for (const at of ['2030-03-10T02:30:00', '2030-03-10T02:30:00-07:00']) {
      expect(schema.safeParse({ ...body, reminder: { kind: 'instant', at } }).success).toBe(false);
    }
  });

  it('keeps legacy date-only task and goal configuration readable in an offline snapshot', () => {
    const stamp = '2030-03-10T12:00:00Z'; const legacy = { kind: 'date', date: '2030-03-10' };
    const snapshot = offlineSnapshotSchema.parse({
      accountId: '10000000-0000-4000-8000-000000000001', capturedAt: stamp, timeZone: 'America/Edmonton',
      coverage: { from: '2030-03-10', through: '2030-03-17', includesOverdue: true, basis: 'persisted' },
      sourceStatus: { availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null },
      courses: [], academicItems: [], taskCompletions: [], goalCompletions: [], events: [], savedEvents: [],
      personalTasks: [{ ...task, id: '20000000-0000-4000-8000-000000000001', description: null,
        priority: 'medium', category: 'personal', due: legacy, scheduled: legacy, recurrence: null, reminder: legacy,
        estimatedMinutes: null, completedAt: null, snoozedUntil: null, mainGoalDate: null, createdAt: stamp, updatedAt: stamp }],
      goals: [{ ...goal, id: '30000000-0000-4000-8000-000000000001', category: 'health', reminder: legacy,
        pausedAt: null, snoozedUntil: null, createdAt: stamp, updatedAt: stamp }],
    });
    expect(snapshot.personalTasks[0]).toMatchObject({ due: legacy, scheduled: legacy, reminder: legacy });
    expect(snapshot.goals[0].reminder).toEqual(legacy);
  });
});
