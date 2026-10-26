import type { Reminder } from '@campusflow/contracts';
import { readCache, writeCache } from '../src/services/cache';
import { acceptTaskReminderRead, confirmTaskReminderSuppression, filterTaskReminders,
  loadTaskReminderSuppression, persistTaskReminderSuppression, resetTaskReminderSuppression,
  taskReminderReadEpoch } from '../src/services/task-reminder-suppression';

jest.mock('../src/services/cache', () => ({ readCache: jest.fn(), writeCache: jest.fn() }));
const owner = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const obsolete: Reminder = { id: '20000000-0000-4000-8000-000000000001',
  targetId: '30000000-0000-4000-8000-000000000001', targetKind: 'personalTask',
  occurrenceKey: null, fireAt: '2099-01-01T00:00:00Z', enabled: true };
const eligible = { ...obsolete, id: '20000000-0000-4000-8000-000000000002',
  targetId: '30000000-0000-4000-8000-000000000002' };
const academic = { ...obsolete, targetKind: 'academicItem' as const };
let stored: unknown;
beforeEach(() => {
  jest.resetAllMocks(); resetTaskReminderSuppression();
  jest.mocked(readCache).mockImplementation(async account => (account === owner ? stored : undefined) as never);
  jest.mocked(writeCache).mockImplementation(async (_account, _key, value) => { stored = value; });
});

it.each([null, {}, [{ taskId: obsolete.targetId, allowedIds: 'invalid' }]])(
  'recovers malformed suppression data without authorizing obsolete cached intent (ToR 13, 19): %j', async malformed => {
    stored = malformed;
    await expect(loadTaskReminderSuppression(owner)).resolves.toBeUndefined();
    expect(filterTaskReminders(owner, [obsolete, eligible, academic])).toEqual([academic]);
    await loadTaskReminderSuppression(second);
    expect(filterTaskReminders(second, [obsolete])).toEqual([obsolete]);
    await persistTaskReminderSuppression(owner, () => true);
    resetTaskReminderSuppression();
    await loadTaskReminderSuppression(owner);
    expect(filterTaskReminders(owner, [obsolete, eligible, academic])).toEqual([academic]);
    // An acknowledgment invalidates an already-started server read.
    const olderEpoch = taskReminderReadEpoch(owner);
    confirmTaskReminderSuppression(owner, obsolete.targetId);
    expect(await acceptTaskReminderRead(owner, [obsolete, eligible], olderEpoch, () => true)).toBe(false);
    expect(await acceptTaskReminderRead(owner, [eligible], taskReminderReadEpoch(owner), () => false)).toBe(false);
    expect(filterTaskReminders(owner, [obsolete, eligible])).toEqual([]);
    expect(await acceptTaskReminderRead(owner, [eligible], taskReminderReadEpoch(owner), () => true)).toBe(true);
    expect(filterTaskReminders(owner, [obsolete, eligible, academic])).toEqual([eligible, academic]);
    await persistTaskReminderSuppression(owner, () => true);
    // Offline relaunch must preserve the recovered allow-list against stale cache.
    resetTaskReminderSuppression();
    await loadTaskReminderSuppression(owner);
    expect(filterTaskReminders(owner, [obsolete, eligible, academic])).toEqual([eligible, academic]);
  });
