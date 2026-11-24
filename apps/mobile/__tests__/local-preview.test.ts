import { campusSourcesSchema, canvasConnectionStatusSchema, classScheduleSchema, courseSchema, focusHistorySchema, goalSchema, gymOverviewSchema, notificationPreferencesSchema, offlineSnapshotSchema, personalTaskSchema, todayResponseSchema, wellnessJournalSchema } from '@campusflow/contracts';
import { localDateAt } from '@campusflow/domain';
import { localPreviewRequest, resetLocalPreview } from '../src/services/local-preview';
import type { Session } from '../src/lib/types';

const session: Session = {
  accessToken: 'local-preview', expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: '00000000-0000-4000-8000-000000000001', email: 'preview@campusflow.local', displayName: 'Alex',
    timeZone: 'America/Edmonton', createdAt: '2026-01-01T00:00:00.000Z' },
};
const read = (path: string) => localPreviewRequest(path, {}, session);
const write = (path: string, body: unknown) => localPreviewRequest(path, { method: 'POST', body: JSON.stringify(body) }, session);
beforeEach(resetLocalPreview);

it('provides schema-valid current-day sample data without a backend', async () => {
  const today = localDateAt(new Date().toISOString(), session.user.timeZone);
  const plan = todayResponseSchema.parse(await read(`/today?date=${today}`));
  expect(plan.date).toBe(today);
  expect(plan.items).toHaveLength(6);
  expect(plan.items.filter(item => item.state === 'completed')).toHaveLength(2);
  expect(plan.upcoming).toHaveLength(3);
  expect(plan.campusEvents).toHaveLength(1);
  expect(offlineSnapshotSchema.safeParse(await read('/snapshot')).success).toBe(true);
  expect(courseSchema.array().safeParse(await read('/courses')).success).toBe(true);
  expect(personalTaskSchema.array().safeParse(await read('/tasks')).success).toBe(true);
  expect(goalSchema.array().safeParse(await read('/goals')).success).toBe(true);
  expect(classScheduleSchema.array().safeParse(await read('/classes')).success).toBe(true);
});

it('adds a task and derives completion and undo in the next Today read', async () => {
  const today = localDateAt(new Date().toISOString(), session.user.timeZone);
  const task = personalTaskSchema.parse(await write('/tasks', { title: 'Read one chapter', scheduled: { kind: 'date', date: today } }));
  expect(todayResponseSchema.parse(await read('/today')).items.some(item => item.entityId === task.id)).toBe(true);
  await write(`/tasks/${task.id}/complete`, { completed: true });
  expect(todayResponseSchema.parse(await read('/today')).items.find(item => item.entityId === task.id)?.state).toBe('completed');
  await write(`/tasks/${task.id}/complete`, { completed: false });
  expect(todayResponseSchema.parse(await read('/today')).items.find(item => item.entityId === task.id)?.state).toBe('today');
});

it('returns schema-valid secondary read models so tabs can show their empty states', async () => {
  const today = localDateAt(new Date().toISOString(), session.user.timeZone);
  const routes = [
    ['/gym', gymOverviewSchema], ['/notification-preferences', notificationPreferencesSchema],
    ['/canvas/status', canvasConnectionStatusSchema], ['/events/sources', campusSourcesSchema],
    [`/wellness/journal?from=${today}&through=${today}`, wellnessJournalSchema],
    [`/focus-sessions?from=${today}&through=${today}`, focusHistorySchema],
  ] as const;
  for (const [path, schema] of routes)
    expect({ path, valid: schema.safeParse(await read(path)).success }).toEqual({ path, valid: true });
});

it('rejects unsupported writes and invalid input rather than claiming a save', async () => {
  await expect(write('/canvas/connect', {})).rejects.toThrow('needs the connected API');
  await expect(write('/tasks', { title: '' })).rejects.toThrow();
  expect(personalTaskSchema.array().parse(await read('/tasks'))).toHaveLength(4);
});
