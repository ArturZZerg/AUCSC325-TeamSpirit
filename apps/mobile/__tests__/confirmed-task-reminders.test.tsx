import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { api } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { useAction, useReminders } from '../src/features/queries';
import { clearScheduledReminders, reconcileReminders } from '../src/services/reminders';
import { readCache } from '../src/services/cache';
import { useSessionStore } from '../src/store/session';
import { useReminderStatus } from '../src/store/reminder-status';
import { snapshotFixture } from './snapshot-fixture';
import type { Reminder, Session } from '../src/lib/types';

jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(), getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(), scheduleNotificationAsync: jest.fn(), SchedulableTriggerInputTypes: { DATE: 'date' } }));
const owner: Session = { accessToken: 'confirmed-task-owner', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: snapshotFixture().accountId, email: 'reminders@example.test', displayName: 'Reminders', timeZone: 'America/Edmonton', createdAt: '2026-10-01T00:00:00Z' } };
const task = { ...snapshotFixture().personalTasks[0], recurrence: null, completedAt: null };
const reminder: Reminder = { id: '50000000-0000-4000-8000-000000000001', targetKind: 'personalTask', targetId: task.id,
  occurrenceKey: null, fireAt: '2098-10-16T18:00:00Z', enabled: true };
const other: Reminder = { ...reminder, id: '50000000-0000-4000-8000-000000000002', targetId: '60000000-0000-4000-8000-000000000002' };
const preferences = { personalEnabled: true, academicEnabled: true, goalEnabled: true, eventEnabled: true,
  dailyOverviewEnabled: false, quietHoursStart: null, quietHoursEnd: null };
const context = () => ({ accountId: owner.user.id, timeZone: owner.user.timeZone, preferences,
  isCurrent: () => useSessionStore.getState().session?.accessToken === owner.accessToken });
const rows = new Map<string, string>();
let scheduled: Notifications.NotificationRequest[] = [];
const run = jest.fn(async (sql: string, values: string[]) => {
  if (sql.startsWith('INSERT')) rows.set(`${values[0]}:${values[1]}`, values[2]);
  else if (values.length === 2) rows.delete(`${values[0]}:${values[1]}`);
  else for (const key of rows.keys()) if (key.startsWith(`${values[0]}:`)) rows.delete(key);
});
const db = { execAsync: jest.fn().mockResolvedValue(undefined), runAsync: run,
  getFirstAsync: jest.fn(async (_sql: string, values: string[]) => {
    const payload = rows.get(`${values[0]}:${values[1]}`); return payload === undefined ? null : { payload };
  }) };
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const ids = () => scheduled.map(item => item.content.data?.reminderId);
const mount = () => renderHook(() => ({ reminders: useReminders(), action: useAction() }), { wrapper: Wrapper });
let serverRows: Reminder[];
let offline: boolean;
beforeEach(async () => {
  jest.clearAllMocks(); rows.clear(); scheduled = []; offline = false; serverRows = [reminder, other];
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(db as unknown as SQLite.SQLiteDatabase);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockImplementation(async () => [...scheduled]);
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async id => { scheduled = scheduled.filter(item => item.identifier !== id); });
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async request => {
    scheduled.push({ identifier: request.identifier!, content: request.content, trigger: null } as Notifications.NotificationRequest); return request.identifier!;
  });
  await clearScheduledReminders();
  useReminderStatus.setState({ accountId: undefined, error: undefined });
  queryClient.clear(); queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } });
  useSessionStore.setState({ session: owner, ready: true });
  queryClient.setQueryData(['account', owner.user.id, 'tasks'], [task]);
  jest.mocked(api).mockImplementation(async path => {
    if (path === '/reminders') { if (offline) throw new Error('Controlled reminders read failure'); return serverRows as never; }
    return (path.endsWith('/complete') ? { ...task, completedAt: '2026-10-15T18:00:00Z' } : { deleted: true }) as never;
  });
});
afterEach(() => { queryClient.clear(); });

it.each(['delete', 'complete'] as const)('cancels acknowledged one-time %s despite failed refresh and persisted offline relaunch (ToR 7, 13, 19)', async operation => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  await reconcileReminders(hook.result.current.reminders.data!, context());
  offline = true;
  await act(async () => { await hook.result.current.action.mutateAsync(operation === 'delete'
    ? { path: `/tasks/${task.id}`, method: 'DELETE' } : { path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  await waitFor(() => expect(hook.result.current.reminders.isError).toBe(true));
  await waitFor(() => expect(hook.result.current.action.isSuccess).toBe(true));
  await reconcileReminders(hook.result.current.reminders.data!, context());
  expect(ids()).toEqual([other.id]);
  // Simulate a new process using only SQLite, including an older persisted list.
  hook.unmount(); queryClient.clear(); await clearScheduledReminders();
  expect(await readCache(owner.user.id, 'reminders')).toBeDefined();
  const reopened = mount(); await waitFor(() => expect(reopened.result.current.reminders.isError).toBe(true));
  await waitFor(() => expect(reopened.result.current.reminders.data).toBeDefined());
  await reconcileReminders(reopened.result.current.reminders.data!, context());
  await reconcileReminders(reopened.result.current.reminders.data!, context());
  expect(ids()).toEqual([other.id]); reopened.unmount();
});

it('does not suppress a rejected server mutation', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  jest.mocked(api).mockRejectedValueOnce(new Error('Server rejected'));
  await act(async () => { await expect(hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } })).rejects.toThrow('Server rejected'); });
  await reconcileReminders(hook.result.current.reminders.data!, context()); expect(ids()).toEqual([reminder.id, other.id]);
});

it('preserves a recurring task’s future template intent after occurrence completion', async () => {
  const recurring = { ...task, recurrence: { frequency: 'daily' as const, interval: 1 } };
  queryClient.setQueryData(['account', owner.user.id, 'tasks'], [recurring]);
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows)); offline = true;
  jest.mocked(api).mockImplementation(async path => { if (path === '/reminders') throw new Error('Offline'); return recurring as never; });
  await act(async () => { await hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true, occurrenceKey: '2026-10-15' } }); });
  await reconcileReminders(hook.result.current.reminders.data!, context()); expect(ids()).toEqual([reminder.id, other.id]);
});

it('allows authoritative eligible intent after undo without restoring an older cached alarm', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows)); offline = true;
  await act(async () => { await hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  const restored = { ...reminder, id: '50000000-0000-4000-8000-000000000003' };
  serverRows = [restored, other]; offline = false;
  jest.mocked(api).mockImplementation(async path => path === '/reminders' ? serverRows as never : task as never);
  await act(async () => { await hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: false } }); });
  await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  await reconcileReminders(hook.result.current.reminders.data!, context()); expect(ids()).toEqual([restored.id, other.id]);
  await reconcileReminders([reminder, other], context()); expect(ids()).toEqual([other.id]);
});

it.each(['account', 'token'] as const)('ignores an acknowledgment delivered after %s replacement', async change => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  const pending = deferred<unknown>(); jest.mocked(api).mockReturnValueOnce(pending.promise);
  let saving!: Promise<unknown>; await act(async () => { saving = hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  await waitFor(() => expect(api).toHaveBeenCalledWith(`/tasks/${task.id}/complete`, expect.anything()));
  const replacement = { ...owner, accessToken: 'replacement', user: { ...owner.user, id: change === 'account' ? other.targetId : owner.user.id } };
  await act(async () => { useSessionStore.setState({ session: replacement }); pending.resolve({ ...task, completedAt: '2026-10-15T18:00:00Z' }); await saving; });
  expect(rows.has(`${owner.user.id}:task-reminder-suppression:v1`)).toBe(false);
});

it('rejects a reminder fetch started before acknowledgment even when it ignores cancellation', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  const acknowledgment = deferred<unknown>(), olderRead = deferred<unknown>();
  let reads = 0;
  jest.mocked(api).mockImplementation(path => {
    if (path !== '/reminders') return acknowledgment.promise as never;
    return (++reads === 1 ? olderRead.promise : Promise.reject(new Error('Post-acknowledgment refetch failed'))) as never;
  });
  let saving!: Promise<unknown>, reading!: Promise<unknown>;
  await act(async () => { saving = hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  await waitFor(() => expect(api).toHaveBeenCalledWith(`/tasks/${task.id}/complete`, expect.anything()));
  await act(async () => { reading = hook.result.current.reminders.refetch(); });
  await act(async () => { acknowledgment.resolve({ ...task, completedAt: '2026-10-15T18:00:00Z' }); await saving; });
  // This response was captured while the task was still open.
  await act(async () => { olderRead.resolve([reminder, other]); await reading; });
  await reconcileReminders([reminder, other], context()); expect(ids()).toEqual([other.id]);
  hook.unmount(); queryClient.clear(); await clearScheduledReminders(); offline = true;
  jest.mocked(api).mockRejectedValue(new Error('Offline'));
  const reopened = mount(); await waitFor(() => expect(reopened.result.current.reminders.data).toEqual([other]));
  await reconcileReminders(reopened.result.current.reminders.data!, context()); expect(ids()).toEqual([other.id]);
});

it('keeps confirmed success and suppresses in memory on persistence failure, then retries locally', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  await reconcileReminders(hook.result.current.reminders.data!, context()); offline = true;
  let failing = true;
  run.mockImplementation(async (sql, values) => {
    if (values[1] === 'task-reminder-suppression:v1' && failing) throw new Error('SQLite full');
    if (sql.startsWith('INSERT')) rows.set(`${values[0]}:${values[1]}`, values[2]);
  });
  await act(async () => { await expect(hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } })).resolves.toMatchObject({ completedAt: expect.any(String) }); });
  expect(ids()).toEqual([other.id]); expect(useReminderStatus.getState().persistenceError).toMatch(/task change is saved/);
  const writes = jest.mocked(api).mock.calls.filter(([path]) => path.endsWith('/complete')).length;
  await reconcileReminders([reminder, other], context()); expect(ids()).toEqual([other.id]);
  expect(useReminderStatus.getState().persistenceError).toBeDefined();
  failing = false; await reconcileReminders([reminder, other], context());
  expect(useReminderStatus.getState().persistenceError).toBeUndefined();
  expect(jest.mocked(api).mock.calls.filter(([path]) => path.endsWith('/complete'))).toHaveLength(writes);
  hook.unmount(); queryClient.clear(); await clearScheduledReminders();
  const reopened = mount(); await waitFor(() => expect(reopened.result.current.reminders.data).toEqual([other]));
});

it('reports native cancellation failure separately from saved mutation and retries without another write', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  await reconcileReminders(hook.result.current.reminders.data!, context()); offline = true;
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockRejectedValueOnce(new Error('Native cancellation failed'));
  await act(async () => { await hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  await waitFor(() => expect(hook.result.current.action.isSuccess).toBe(true));
  expect(useReminderStatus.getState().error).toMatch(/task change is saved/);
  await reconcileReminders([reminder, other], context()); await reconcileReminders([reminder, other], context());
  expect(ids()).toEqual([other.id]); expect(useReminderStatus.getState().error).toBeUndefined();
  expect(jest.mocked(api).mock.calls.filter(([path]) => path.endsWith('/complete'))).toHaveLength(1);
});

it('cancels an obsolete schedule already inside the native API when completion is acknowledged', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  const native = deferred<string>(), entered = deferred<void>();
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementationOnce(async request => {
    entered.resolve(); await native.promise;
    scheduled.push({ identifier: request.identifier!, content: request.content, trigger: null } as Notifications.NotificationRequest); return request.identifier!;
  });
  const reconciling = reconcileReminders([reminder, other], context()); await entered.promise;
  offline = true; let saving!: Promise<unknown>;
  await act(async () => { saving = hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  await waitFor(() => expect(api).toHaveBeenCalledWith(`/tasks/${task.id}/complete`, expect.anything()));
  await act(async () => { native.resolve('scheduled'); await reconciling; await saving; });
  await reconcileReminders([reminder, other], context()); expect(ids()).toEqual([other.id]);
});

it('does not apply one account’s suppression to another account or to academic intent', async () => {
  const academic = { ...reminder, id: '50000000-0000-4000-8000-000000000004', targetKind: 'academicItem' as const };
  serverRows = [reminder, academic];
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows)); offline = true;
  await act(async () => { await hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  await reconcileReminders(serverRows, context()); expect(ids()).toEqual([academic.id]);
  const second = { ...owner, accessToken: 'second-account', user: { ...owner.user, id: other.targetId } };
  await act(async () => { useSessionStore.setState({ session: second }); });
  await reconcileReminders([reminder], { ...context(), accountId: second.user.id, isCurrent: () => true });
  expect(scheduled[0].content.data).toMatchObject({ accountId: second.user.id, reminderId: reminder.id });
});

it('does not resurrect suppressed intent when scheduling an unrelated reminder fails, and retries idempotently', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows)); offline = true;
  await act(async () => { await hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  jest.mocked(Notifications.scheduleNotificationAsync).mockRejectedValueOnce(new Error('Native scheduling failed'));
  await expect(reconcileReminders([reminder, other], context())).rejects.toThrow('Native scheduling failed');
  expect(useReminderStatus.getState().error).toMatch(/Retry in Settings/);
  await reconcileReminders([reminder, other], context()); await reconcileReminders([reminder, other], context());
  expect(ids()).toEqual([other.id]); expect(useReminderStatus.getState().error).toBeUndefined();
});

it('filters an older SQLite fallback that finishes after acknowledged completion', async () => {
  const fallback = deferred<{ payload: string }>();
  db.getFirstAsync.mockImplementationOnce(async () => fallback.promise);
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows)); offline = true;
  await act(async () => { await hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  await act(async () => { fallback.resolve({ payload: JSON.stringify([reminder, other]) }); });
  await reconcileReminders(hook.result.current.reminders.data!, context()); expect(ids()).toEqual([other.id]);
});

it('suppresses deletion from an offline list even when no task query result was hydrated', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows)); offline = true;
  queryClient.removeQueries({ queryKey: ['account', owner.user.id, 'tasks'] });
  await act(async () => { await hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}`, method: 'DELETE', deletedTask: task }); });
  await reconcileReminders([reminder, other], context()); expect(ids()).toEqual([other.id]);
});

it('does not let a delayed suppression-cache read overwrite a newer acknowledged completion', async () => {
  const ledger = deferred<{ payload: string }>();
  const originalRead = db.getFirstAsync.getMockImplementation()!;
  let delayed = false;
  db.getFirstAsync.mockImplementation(async (sql, values) => {
    if (values[1] === 'task-reminder-suppression:v1' && !delayed) { delayed = true; return ledger.promise; }
    return originalRead(sql, values);
  });
  const hook = mount(); await waitFor(() => expect(delayed).toBe(true));
  let saving!: Promise<unknown>;
  await act(async () => { saving = hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  await waitFor(() => expect(api).toHaveBeenCalledWith(`/tasks/${task.id}/complete`, expect.anything())); offline = true;
  await act(async () => { ledger.resolve({ payload: JSON.stringify([{ taskId: task.id, allowedIds: [reminder.id] }]) }); await saving; });
  await reconcileReminders([reminder, other], context()); expect(ids()).toEqual([other.id]);
  db.getFirstAsync.mockImplementation(originalRead);
});

it('cancels legacy stable-ID schedules without a reminderId field', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  await reconcileReminders([reminder, other], context());
  delete scheduled[0].content.data?.reminderId;
  offline = true;
  await act(async () => { await hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); });
  expect(ids()).toEqual([other.id]);
});

it('reports incomplete legacy cancellation when its SQLite mapping cannot be read, without failing the saved delete', async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.reminders.data).toEqual(serverRows));
  await reconcileReminders(serverRows, context());
  delete scheduled[0].content.data?.targetKind; delete scheduled[0].content.data?.targetId;
  queryClient.removeQueries({ queryKey: ['account', owner.user.id, 'reminders'] }); offline = true;
  const originalRead = db.getFirstAsync.getMockImplementation()!;
  db.getFirstAsync.mockImplementation(async (sql, values) => {
    if (values[1] === 'reminders') throw new Error('Cache mapping unavailable');
    return originalRead(sql, values);
  });
  await act(async () => { await expect(hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}`, method: 'DELETE', deletedTask: task })).resolves.toEqual({ deleted: true }); });
  expect(useReminderStatus.getState().error).toMatch(/task change is saved/);
  db.getFirstAsync.mockImplementation(originalRead);
  await reconcileReminders(serverRows, context()); expect(ids()).toEqual([other.id]);
});
