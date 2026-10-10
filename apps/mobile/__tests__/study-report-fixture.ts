import type { FocusHistory } from '@campusflow/contracts';
export const reportAccount = '10000000-0000-4000-8000-000000000001';
export const reportTask = '20000000-0000-4000-8000-000000000001';
export function reportFixture(): FocusHistory {
  return { accountId: reportAccount, timeZone: 'America/Edmonton', from: '2025-02-24', through: '2025-03-09', capturedAt: '2025-03-09T18:00:00Z',
    sessions: [{ id: '30000000-0000-4000-8000-000000000001', taskId: reportTask, title: 'Captured title',
      startedAt: '2025-03-09T07:00:00Z', endedAt: '2025-03-09T07:25:00Z', focusedSeconds: 1500, plannedMinutes: 25, outcome: 'completed', createdAt: '2025-03-09T07:25:00Z' },
    { id: '30000000-0000-4000-8000-000000000002', taskId: null, title: 'Free study',
      startedAt: '2025-03-03T17:00:00Z', endedAt: '2025-03-03T17:01:05Z', focusedSeconds: 65, plannedMinutes: 25, outcome: 'interrupted', createdAt: '2025-03-03T17:01:05Z' },
    { id: '30000000-0000-4000-8000-000000000003', taskId: reportTask, title: 'Captured title',
      startedAt: '2025-02-25T17:00:00Z', endedAt: '2025-02-25T17:25:00Z', focusedSeconds: 1500, plannedMinutes: 25, outcome: 'completed', createdAt: '2025-02-25T17:25:00Z' }],
  };
}
