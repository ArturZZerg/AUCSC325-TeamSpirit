import type { OfflineSnapshot } from '@campusflow/contracts';

export const accountId = '10000000-0000-4000-8000-000000000001';
export const taskId = '20000000-0000-4000-8000-000000000001';
export const goalId = '30000000-0000-4000-8000-000000000001';
export const stamp = '2025-03-08T18:00:00Z';
export function snapshotFixture(): OfflineSnapshot {
  return { accountId, capturedAt: stamp, timeZone: 'America/Edmonton',
    coverage: { from: '2025-03-08', through: '2025-03-15', includesOverdue: true, basis: 'persisted' },
    sourceStatus: { availability: 'unavailable', lastSuccessfulSyncAt: '2025-03-07T18:00:00Z', coveredFrom: '2025-03-01', coveredThrough: '2025-03-20' },
    courses: [], academicItems: [], personalTasks: [{ id: taskId, title: 'Daily reading', description: null,
      priority: 'medium', category: 'personal', due: { kind: 'instant', at: '2025-03-08T16:00:00Z' },
      scheduled: null, recurrence: { frequency: 'daily', interval: 1 }, reminder: null,
      estimatedMinutes: null, completedAt: null, snoozedUntil: null, mainGoalDate: null, createdAt: stamp, updatedAt: stamp }],
    taskCompletions: [{ taskId, occurrenceKey: '2025-03-09', completedAt: '2025-03-09T15:00:00Z' }],
    goals: [{ id: goalId, title: 'Exercise', category: 'health', schedule: { kind: 'daily' }, timeZone: 'Pacific/Honolulu',
      reminder: null, pausedAt: null, snoozedUntil: null, createdAt: stamp, updatedAt: stamp }],
    goalCompletions: [{ id: '40000000-0000-4000-8000-000000000001', goalId, occurrenceKey: '2025-03-08',
      state: 'skipped', completedAt: null, createdAt: stamp }], events: [], savedEvents: [],
  };
}
