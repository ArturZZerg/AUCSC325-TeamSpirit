import type { PropsWithChildren } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { TaskEditor } from '../src/features/task-editor';
import { useAction, useTasks } from '../src/features/queries';
import { api, ApiError } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { useSessionStore } from '../src/store/session';
import { snapshotFixture } from './snapshot-fixture';
import type { PersonalTask, Session } from '../src/lib/types';
import Tasks from '../app/(tabs)/tasks';
import StudyPlans from '../app/study-plans';
import Workload from '../app/workload';
import { preparationFixture } from './preparation-fixture';
import { TaskReminderEditor } from '../src/features/task-reminder-editor';
import { taskEditBaseline } from '../src/features/task-edit-freshness';

jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn().mockResolvedValue(undefined), writeCache: jest.fn().mockResolvedValue(undefined), clearAccountCache: jest.fn(), deleteCache: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09', resumeCount: 0 }) }));
jest.mock('../src/features/use-agenda-clock', () => ({ useAgendaClock: () => '2025-03-09T18:00:00Z' }));
const owner: Session = { accessToken: 'edit-token', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'edit@example.test', displayName: 'Edit', timeZone: 'UTC', createdAt: '2026-10-03T00:00:00Z',
} };
const task: PersonalTask = { ...snapshotFixture().personalTasks[0], title: 'Old title', description: null };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
beforeEach(() => {
  queryClient.clear(); queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } });
  useSessionStore.setState({ session: null });
  useSessionStore.setState({ session: { ...owner }, ready: true });
  jest.mocked(api).mockReset().mockResolvedValue(task);
});

it('invalidates an open draft at write start, waits for overlapping writes, and explicitly rebases unchanged fields', async () => {
  const one = deferred<typeof task>(), two = deferred<typeof task>(); let server = { ...task };
  jest.mocked(api).mockImplementation((_path, init) => init?.method === 'PATCH' ? one.promise
    : init?.method === 'POST' ? two.promise : Promise.resolve({ ...server }));
  const action = renderHook(() => useAction(), { wrapper: Wrapper });
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper }); await screen.findByLabelText('Title');
  fireEvent.changeText(screen.getByLabelText('Description'), 'Unsaved notes');
  let first!: Promise<unknown>, second!: Promise<unknown>;
  await act(async () => {
    first = action.result.current.mutateAsync({ path: `/tasks/${task.id}`, method: 'PATCH', body: { title: 'New title' } });
    second = action.result.current.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } });
  });
  expect(screen.getByText('Save task')).toBeDisabled(); expect(screen.getByLabelText('Description')).toHaveDisplayValue('Unsaved notes');
  fireEvent.press(screen.getByText('Reload task'));
  expect(screen.getByRole('alert')).toHaveTextContent(/Wait for task changes to finish/);
  const reads = jest.mocked(api).mock.calls.filter(([, init]) => !init?.method).length;
  await act(async () => { server = { ...server, completedAt: '2026-10-03T12:00:00Z' }; two.resolve(server); await second; });
  fireEvent.press(screen.getByText('Reload task'));
  expect(jest.mocked(api).mock.calls.filter(([, init]) => !init?.method)).toHaveLength(reads);
  await act(async () => { server = { ...server, title: 'New title' }; one.resolve(server); await first; });
  // Acknowledgment arrival order is not used to reconcile entity values.
  expect(screen.getByText('Save task')).toBeDisabled(); fireEvent.press(screen.getByText('Reload task'));
  await waitFor(() => expect(screen.getByText('Save task')).toBeEnabled());
  expect(screen.getByLabelText('Title')).toHaveDisplayValue('New title');
  expect(screen.getByLabelText('Description')).toHaveDisplayValue('Unsaved notes');
});

it('rejects a detail read begun before a relevant write, even when timestamps tie', async () => {
  const read = deferred<typeof task>(); let reads = 0;
  jest.mocked(api).mockImplementation((_path, init) => init?.method ? Promise.resolve({ ...task, title: 'New title' })
    : ++reads === 1 ? read.promise : Promise.resolve({ ...task, title: 'New title' }));
  const action = renderHook(() => useAction(), { wrapper: Wrapper });
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper });
  await waitFor(() => expect(api).toHaveBeenCalled());
  await act(async () => { await action.result.current.mutateAsync({ path: `/tasks/${task.id}`, method: 'PATCH', body: { title: 'New title' } }); read.resolve(task); });
  expect(screen.queryByLabelText('Title')).toBeNull(); fireEvent.press(screen.getByText('Reload task'));
  await waitFor(() => expect(screen.getByLabelText('Title')).toHaveDisplayValue('New title'));
});

it.each(['network', '404', 'partial', 'wrong entity'])('blocks editing after a %s detail response and permits explicit retry', async failure => {
  if (failure === 'network' || failure === '404') jest.mocked(api).mockRejectedValueOnce(failure === '404' ? new ApiError(404, 'Not found') : new TypeError('Offline'));
  else jest.mocked(api).mockResolvedValueOnce(failure === 'partial' ? { id: task.id, title: 'Partial' } : { ...task, id: '20000000-0000-4000-8000-000000000099' });
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper });
  await screen.findByText(failure === '404' ? 'This task is no longer available.' : failure === 'wrong entity'
    ? 'Task or session changed. Reload before editing.' : 'Could not load the task. Please reload to edit.');
  expect(screen.queryByLabelText('Title')).toBeNull(); expect(screen.queryByText('Save task')).toBeNull();
  fireEvent.press(screen.getByText('Reload task')); await screen.findByLabelText('Title');
});

it.each(['logout', 'account', 'token', 'timezone'])('rejects late detail reads after %s', async transition => {
  const read = deferred<typeof task>(); jest.mocked(api).mockReturnValueOnce(read.promise);
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper });
  await waitFor(() => expect(api).toHaveBeenCalled());
  act(() => { useSessionStore.setState({ session: transition === 'logout' ? null : {
    ...owner, accessToken: transition === 'token' ? 'replacement-token' : owner.accessToken,
    user: { ...owner.user, id: transition === 'account' ? '10000000-0000-4000-8000-000000000009' : owner.user.id,
      timeZone: transition === 'timezone' ? 'Asia/Tokyo' : owner.user.timeZone },
  } }); });
  await act(async () => { read.resolve({ ...task, title: 'Obsolete response' }); });
  expect(screen.queryByLabelText('Title')).toBeNull();
  if (transition !== 'logout') { fireEvent.press(screen.getByText('Reload task')); await screen.findByLabelText('Title'); expect(screen.getByLabelText('Title')).toHaveDisplayValue(task.title); }
});

it('invalidates an already loaded timezone baseline without losing its draft', async () => {
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper }); await screen.findByLabelText('Title');
  fireEvent.changeText(screen.getByLabelText('Description'), 'Keep my draft');
  act(() => useSessionStore.setState({ session: { ...owner, user: { ...owner.user, timeZone: 'Asia/Tokyo' } } }));
  expect(screen.getByText('Save task')).toBeDisabled(); expect(screen.getByLabelText('Description')).toHaveDisplayValue('Keep my draft');
  fireEvent.press(screen.getByText('Reload task')); await waitFor(() => expect(screen.getByText('Save task')).toBeEnabled());
  expect(screen.getByLabelText('Description')).toHaveDisplayValue('Keep my draft');
});

it('always reads on reopening, including a restored session with only stale cached rows', async () => {
  const first = render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper }); await screen.findByLabelText('Title'); first.unmount();
  act(() => useSessionStore.setState({ session: null })); queryClient.clear();
  act(() => useSessionStore.setState({ session: { ...owner } }));
  const read = deferred<typeof task>(); jest.mocked(api).mockReturnValueOnce(read.promise);
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper });
  expect(screen.queryByLabelText('Title')).toBeNull();
  await act(async () => { read.resolve({ ...task, title: 'Current after restart' }); });
  expect(screen.getByLabelText('Title')).toHaveDisplayValue('Current after restart');
});

it.each(['token', 'timezone', 'logout/login'])('retains outstanding write barriers across %s until the server request settles', async transition => {
  const write = deferred<typeof task>();
  jest.mocked(api).mockImplementation((_path, init) => init?.method ? write.promise : Promise.resolve({ ...task, title: 'After write' }));
  const action = renderHook(() => useAction(), { wrapper: Wrapper }); let mutation!: Promise<unknown>;
  await act(async () => { mutation = action.result.current.mutateAsync({ path: `/tasks/${task.id}`, method: 'PATCH', body: { title: 'After write' } }); });
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  act(() => {
    if (transition === 'logout/login') useSessionStore.setState({ session: null });
    useSessionStore.setState({ session: { ...owner, accessToken: transition === 'token' ? 'new-token' : owner.accessToken,
      user: { ...owner.user, timeZone: transition === 'timezone' ? 'Asia/Tokyo' : owner.user.timeZone } } });
  });
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper });
  expect(screen.queryByLabelText('Title')).toBeNull(); expect(api).toHaveBeenCalledTimes(1);
  await act(async () => { write.resolve({ ...task, title: 'After write' }); await mutation; });
  fireEvent.press(screen.getByText('Reload task')); await screen.findByLabelText('Title');
  expect(screen.getByLabelText('Title')).toHaveDisplayValue('After write');
});

it('keeps a failed-write draft disabled until a new authoritative read, without masking the mutation error', async () => {
  jest.mocked(api).mockImplementation((_path, init) => init?.method ? Promise.reject(new ApiError(409, 'Task conflict')) : Promise.resolve(task));
  const close = jest.fn(); render(<TaskEditor task={task} onClose={close}/>, { wrapper: Wrapper }); await screen.findByLabelText('Title');
  fireEvent.changeText(screen.getByLabelText('Description'), 'Keep these notes'); fireEvent.press(screen.getByText('Save task'));
  await screen.findByText('Task conflict'); expect(close).not.toHaveBeenCalled(); expect(screen.getByText('Save task')).toBeDisabled();
  fireEvent.press(screen.getByText('Reload task')); await waitFor(() => expect(screen.getByText('Save task')).toBeEnabled());
  expect(screen.getByLabelText('Description')).toHaveDisplayValue('Keep these notes');
});

it('keeps an open draft read-only after confirmed deletion and a fresh 404', async () => {
  let deleted = false;
  jest.mocked(api).mockImplementation((_path, init) => {
    if (init?.method === 'DELETE') { deleted = true; return Promise.resolve({ deleted: true }); }
    return deleted ? Promise.reject(new ApiError(404, 'Not found')) : Promise.resolve(task);
  });
  const action = renderHook(() => useAction(), { wrapper: Wrapper });
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper }); await screen.findByLabelText('Title');
  fireEvent.changeText(screen.getByLabelText('Description'), 'Unsaved notes');
  await act(async () => { await action.result.current.mutateAsync({ path: `/tasks/${task.id}`, method: 'DELETE' }); });
  fireEvent.press(screen.getByText('Reload task')); await screen.findByText('This task is no longer available.');
  expect(screen.getByText('Save task')).toBeDisabled(); expect(screen.getByLabelText('Description')).toHaveDisplayValue('Unsaved notes');
  fireEvent.press(screen.getByText('Save task'));
  expect(jest.mocked(api).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
});

it('rejects submission if another task write starts during awaited query cancellation', async () => {
  const cancellation = deferred<void>(); const cancel = jest.spyOn(queryClient, 'cancelQueries').mockReturnValueOnce(cancellation.promise);
  jest.mocked(api).mockResolvedValue(task);
  try {
    const action = renderHook(() => useAction(), { wrapper: Wrapper });
    render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper }); await screen.findByLabelText('Title');
    fireEvent.changeText(screen.getByLabelText('Title'), 'Draft title'); fireEvent.press(screen.getByText('Save task'));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await act(async () => { await action.result.current.mutateAsync({ path: `/tasks/${task.id}/complete`, body: { completed: true } }); cancellation.resolve(); });
    await screen.findByText('Reload the task before saving.');
    expect(jest.mocked(api).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('Draft title');
  } finally { cancel.mockRestore(); }
});

it('invalidates all task baselines for academic Main Goal assignment but leaves unrelated task writes entity-scoped', async () => {
  const action = renderHook(() => useAction(), { wrapper: Wrapper });
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper }); await screen.findByLabelText('Title');
  await act(async () => { await action.result.current.mutateAsync({ path: '/tasks/20000000-0000-4000-8000-000000000099', method: 'PATCH', body: { title: 'Unrelated' } }); });
  expect(screen.getByText('Save task')).toBeEnabled();
  await act(async () => { await action.result.current.mutateAsync({ path: '/academic-items/example/main-goal', body: { date: '2026-10-03' } }); });
  expect(screen.getByText('Save task')).toBeDisabled();
});

it('awaits committed wellness cleanup across a profile-only timezone change', async () => {
  const write = deferred<unknown>(), cleanup = deferred<void>(); const afterCommit = jest.fn(() => cleanup.promise);
  jest.mocked(api).mockReturnValueOnce(write.promise);
  const action = renderHook(() => useAction(afterCommit), { wrapper: Wrapper }); let settled = false, mutation!: Promise<unknown>;
  await act(async () => { mutation = action.result.current.mutateAsync({ path: '/wellness/journal/2026-10-03', method: 'PUT', body: {} }).then(value => { settled = true; return value; }); });
  await waitFor(() => expect(api).toHaveBeenCalled());
  act(() => useSessionStore.setState({ session: { ...owner, user: { ...owner.user, timeZone: 'Asia/Tokyo' } } }));
  await act(async () => { write.resolve({}); }); expect(afterCommit).toHaveBeenCalledWith({}, owner); expect(settled).toBe(false);
  await act(async () => { cleanup.resolve(); await mutation; }); expect(settled).toBe(true);
});

it('revalidates the current timezone after an in-flight task write acknowledges an older profile', async () => {
  const write = deferred<PersonalTask>(); let server = task, reads = 0;
  jest.mocked(api).mockImplementation((_path, init) => init?.method ? write.promise : (reads++, Promise.resolve([server])));
  const hook = renderHook(() => ({ action: useAction(), tasks: useTasks() }), { wrapper: Wrapper });
  await waitFor(() => expect(hook.result.current.tasks.data).toEqual([task])); let mutation!: Promise<unknown>;
  await act(async () => { mutation = hook.result.current.action.mutateAsync({ path: `/tasks/${task.id}`, method: 'PATCH', body: { title: 'After write' } }); });
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  await act(async () => { await useSessionStore.getState().syncProfile(owner.user.id, owner.accessToken, { ...owner.user, timeZone: 'Asia/Tokyo' }); });
  await waitFor(() => expect(reads).toBe(2));
  await act(async () => { server = { ...task, title: 'After write' }; write.resolve(server); await mutation; });
  await waitFor(() => expect(reads).toBe(3)); await waitFor(() => expect(hook.result.current.tasks.data).toEqual([server]));
});

it('discards a draft after logout/login even when React batches a return to identical credentials', async () => {
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper }); await screen.findByLabelText('Title');
  fireEvent.changeText(screen.getByLabelText('Description'), 'Private old login draft');
  act(() => { useSessionStore.setState({ session: null }); useSessionStore.setState({ session: { ...owner } }); });
  expect(screen.queryByLabelText('Description')).toBeNull();
  fireEvent.press(screen.getByText('Reload task')); await screen.findByLabelText('Description');
  expect(screen.getByLabelText('Description')).toHaveDisplayValue('');
});

it('bounds a stalled detail read and ignores its late response after an explicit retry', async () => {
  jest.useFakeTimers(); const stalled = deferred<typeof task>(); jest.mocked(api).mockReturnValueOnce(stalled.promise);
  try {
    render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper });
    await act(async () => { jest.advanceTimersByTime(15_000); });
    expect(screen.getByText('Could not load the task. Please reload to edit.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Reload task')); await act(async () => {});
    expect(screen.getByLabelText('Title')).toHaveDisplayValue(task.title);
    await act(async () => { stalled.resolve({ ...task, title: 'Late response' }); });
    expect(screen.getByLabelText('Title')).toHaveDisplayValue(task.title);
  } finally { jest.useRealTimers(); }
});

it('preserves a dirty date and its mode when explicit reload receives a changed server deadline', async () => {
  const initial: PersonalTask = { ...task, due: { kind: 'date', date: '2026-10-03' } };
  let server = initial;
  jest.mocked(api).mockImplementation((_path, init) => init?.method ? Promise.resolve(server) : Promise.resolve(server));
  const action = renderHook(() => useAction(), { wrapper: Wrapper });
  render(<TaskEditor task={initial} onClose={jest.fn()}/>, { wrapper: Wrapper }); await screen.findByLabelText('Due date');
  fireEvent.changeText(screen.getByLabelText('Due date'), '2026-10-05');
  await act(async () => { await action.result.current.mutateAsync({ path: `/tasks/${task.id}`, method: 'PATCH', body: { due: null } }); });
  server = { ...initial, due: null };
  fireEvent.press(screen.getByText('Reload task')); await waitFor(() => expect(screen.getByText('Save task')).toBeEnabled());
  expect(screen.getByLabelText('Due date')).toHaveDisplayValue('2026-10-05'); expect(screen.getByRole('radio', { name: 'Date only' })).toBeChecked();
});

it.each(['/academic-items/example', '/goals/example'])('retains awaited revalidation for unguarded %s edits', async path => {
  const refresh = deferred<typeof task[]>(); let reads = 0, settled = false;
  jest.mocked(api).mockImplementation((_path, init) => init?.method ? Promise.resolve({}) : ++reads === 1 ? Promise.resolve([task]) : refresh.promise);
  const hook = renderHook(() => ({ action: useAction(), tasks: useTasks() }), { wrapper: Wrapper });
  await waitFor(() => expect(hook.result.current.tasks.data).toEqual([task]));
  let mutation!: Promise<unknown>;
  await act(async () => { mutation = hook.result.current.action.mutateAsync({ path, method: 'PATCH', body: { title: 'Edit' } }).then(value => { settled = true; return value; }); });
  await waitFor(() => expect(reads).toBe(2)); expect(settled).toBe(false);
  await act(async () => { refresh.resolve([task]); await mutation; }); expect(settled).toBe(true);
});

it('keeps the unguarded task reminder editor saving until its active refresh completes', async () => {
  const refresh = deferred<PersonalTask[]>(); let reads = 0; const close = jest.fn();
  jest.mocked(api).mockImplementation((_path, init) => init?.method ? Promise.resolve(task) : ++reads === 1 ? Promise.resolve([task]) : refresh.promise);
  const list = renderHook(() => useTasks(), { wrapper: Wrapper }); await waitFor(() => expect(list.result.current.data).toEqual([task]));
  render(<TaskReminderEditor task={task} timeZone="UTC" onClose={close}/>, { wrapper: Wrapper });
  fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(reads).toBe(2));
  expect(close).not.toHaveBeenCalled(); expect(screen.getByText('Saving…')).toBeDisabled();
  await act(async () => { refresh.resolve([task]); }); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
afterEach(() => { queryClient.clear(); });

it.each(['recurrence', 'schedule'])('rebases independently when only the %s draft is dirty', async dirty => {
  const initial: PersonalTask = { ...task, studyPlanId: null, completedAt: null, due: null,
    scheduled: { kind: 'date', date: '2026-10-03' }, recurrence: { frequency: 'daily', interval: 1 } };
  let server = initial;
  jest.mocked(api).mockImplementation((_path, init) => {
    if (init?.method === 'PATCH') server = { ...server, ...JSON.parse(String(init.body)) };
    return Promise.resolve({ ...server });
  });
  const action = renderHook(() => useAction(), { wrapper: Wrapper }); const close = jest.fn();
  render(<TaskEditor task={initial} onClose={close}/>, { wrapper: Wrapper });
  await screen.findByLabelText('Repeat every (days)');
  fireEvent.changeText(screen.getByLabelText(dirty === 'recurrence' ? 'Repeat every (days)' : 'Scheduled date'), dirty === 'recurrence' ? '2' : '2026-10-05');
  await act(async () => { await action.result.current.mutateAsync({ path: `/tasks/${task.id}`, method: 'PATCH', body: dirty === 'recurrence'
    ? { scheduled: { kind: 'date', date: '2026-10-04' } } : { recurrence: { frequency: 'daily', interval: 3 } } }); });
  expect(screen.getByText('Save task')).toBeDisabled();
  fireEvent.press(screen.getByText('Reload task')); await waitFor(() => expect(screen.getByText('Save task')).toBeEnabled());
  fireEvent.press(screen.getByText('Save task')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(server.scheduled).toEqual({ kind: 'date', date: dirty === 'recurrence' ? '2026-10-04' : '2026-10-05' });
  expect(server.recurrence).toEqual({ frequency: 'daily', interval: dirty === 'recurrence' ? 2 : 3 });
});

// Observe registry lifetime without exposing token-bearing internals through a
// production debug API. Other Maps used by React/Query are excluded by key.
function ownerRegistry() {
  const set = jest.spyOn(Map.prototype, 'set');
  taskEditBaseline(owner, task.id);
  const index = set.mock.calls.findIndex(([key]) => key === JSON.stringify([owner.user.id, owner.accessToken]));
  const registry = set.mock.contexts[index] as Map<string, unknown>;
  set.mockRestore();
  expect(registry).toBeDefined();
  return registry;
}

it('does not recreate a logged-out owner registry when its late GET completes', async () => {
  const registry = ownerRegistry(), read = deferred<PersonalTask>(); jest.mocked(api).mockReturnValueOnce(read.promise);
  render(<TaskEditor task={task} onClose={jest.fn()}/>, { wrapper: Wrapper }); await waitFor(() => expect(api).toHaveBeenCalled());
  act(() => useSessionStore.setState({ session: null })); expect(registry.size).toBe(0);
  await act(async () => { read.resolve(task); });
  expect(screen.queryByLabelText('Title')).toBeNull(); expect(registry.size).toBe(0);
});

it('releases obsolete settled write records while preserving the active owner baseline', async () => {
  const registry = ownerRegistry(), write = deferred<PersonalTask>(); jest.mocked(api).mockReturnValueOnce(write.promise);
  const action = renderHook(() => useAction(), { wrapper: Wrapper }); let mutation!: Promise<unknown>;
  await act(async () => { mutation = action.result.current.mutateAsync({ path: `/tasks/${task.id}`, method: 'PATCH', body: { title: 'Committed' } }); });
  await waitFor(() => expect(api).toHaveBeenCalled());
  const current: Session = { ...owner, accessToken: 'other-account-token', user: { ...owner.user, id: '10000000-0000-4000-8000-000000000009' } };
  act(() => useSessionStore.setState({ session: current }));
  const baseline = taskEditBaseline(current, task.id)!; expect(registry.size).toBe(2);
  await act(async () => { write.resolve(task); await mutation; });
  expect(registry.has(JSON.stringify([owner.user.id, owner.accessToken]))).toBe(false);
  expect(registry.size).toBe(1); expect(taskEditBaseline(current, task.id)).toEqual(baseline);
});

it.each(['Tasks', 'Study Plans', 'Workload'])('requires the shared authoritative gate from %s', async surface => {
  const detail = deferred<typeof task>(); const plan = preparationFixture();
  const row = surface === 'Study Plans' ? plan.tasks[0] : { ...task, recurrence: null, scheduled: null, due: null, studyPlanId: null };
  jest.mocked(api).mockImplementation(path => path === '/tasks' ? Promise.resolve([row])
    : path === '/study-plans' ? Promise.resolve(surface === 'Study Plans' ? [plan] : [])
      : path === '/academic-items' ? Promise.resolve([]) : detail.promise);
  const Component = surface === 'Tasks' ? Tasks : surface === 'Study Plans' ? StudyPlans : Workload;
  render(<Component/>, { wrapper: Wrapper });
  if (surface === 'Study Plans') {
    fireEvent.press(await screen.findByText('Show sessions'));
    fireEvent.press(screen.getAllByText('Edit session')[0]);
  } else fireEvent.press(await screen.findByText(surface === 'Tasks' ? 'Edit' : 'Schedule task'));
  expect(screen.queryByLabelText('Title')).toBeNull(); expect(screen.queryByText('Save task')).toBeNull();
  await waitFor(() => expect(api).toHaveBeenCalledWith(`/tasks/${row.id}`, expect.objectContaining({ cache: 'no-store', headers: { Authorization: `Bearer ${owner.accessToken}` } })));
  await act(async () => { detail.resolve({ ...row, title: 'Authoritative detail' }); });
  expect(screen.getByLabelText('Title')).toHaveDisplayValue('Authoritative detail');
});

it('reopens from an authoritative detail read and preserves acknowledged title during a stalled list refresh', async () => {
  const refresh = deferred<typeof task[]>(); let server = { ...task }, reads = 0;
  const writes: Record<string, unknown>[] = [];
  jest.mocked(api).mockImplementation((path, init) => {
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)); writes.push(body); server = { ...server, ...body }; return Promise.resolve({ ...server });
    }
    if (path === '/tasks') return ++reads === 1 ? Promise.resolve([task]) : refresh.promise;
    return Promise.resolve({ ...server });
  });
  const list = renderHook(() => useTasks(), { wrapper: Wrapper });
  await waitFor(() => expect(list.result.current.data).toEqual([task]));
  const close = jest.fn(); const first = render(<TaskEditor task={task} onClose={close}/>, { wrapper: Wrapper });
  await screen.findByLabelText('Title'); fireEvent.changeText(screen.getByLabelText('Title'), 'Acknowledged title');
  fireEvent.press(screen.getByText('Save task')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); first.unmount();
  expect(list.result.current.isFetching).toBe(true); expect(list.result.current.data![0].title).toBe('Old title');
  render(<TaskEditor task={list.result.current.data![0]} onClose={close}/>, { wrapper: Wrapper });
  await screen.findByLabelText('Title');
  fireEvent.changeText(screen.getByLabelText('Description'), 'New notes'); fireEvent.press(screen.getByText('Save task'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
  expect(writes[1]).toMatchObject({ title: 'Acknowledged title', description: 'New notes' });
  expect(server).toMatchObject({ title: 'Acknowledged title', description: 'New notes' });
  await act(async () => { refresh.resolve([server]); });
  await waitFor(() => expect(list.result.current.data).toEqual([server]));
});
