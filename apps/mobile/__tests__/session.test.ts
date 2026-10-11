import * as SecureStore from 'expo-secure-store';
import { useSessionStore } from '../src/store/session';
import { queryClient } from '../src/lib/query-client';
import { clearAccountCache, deleteCache } from '../src/services/cache';
import { clearScheduledReminders } from '../src/services/reminders';
import type { Session } from '../src/lib/types';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('../src/services/cache', () => ({ clearAccountCache: jest.fn().mockResolvedValue(undefined), deleteCache: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn().mockResolvedValue(undefined) }));

const first: Session = { accessToken: 'first-token', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'first@example.test', displayName: 'First', timeZone: 'America/Edmonton', createdAt: '2026-10-03T00:00:00Z',
} };
const second = { ...first, accessToken: 'second-token', user: { ...first.user, id: '10000000-0000-4000-8000-000000000002' } };
beforeEach(() => { jest.clearAllMocks(); queryClient.clear(); useSessionStore.setState({ session: null, ready: false });
  queryClient.setDefaultOptions({ queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } });
  jest.mocked(SecureStore.getItemAsync).mockReset().mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

describe('local account lifecycle (ToR 19)', () => {
  it.each(['invalid JSON', '{"accessToken":"incomplete"}'])('recovers from unreadable stored session: %s', async raw => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(raw);
    await useSessionStore.getState().restore();
    expect(useSessionStore.getState()).toMatchObject({ session: null, ready: true });
  });

  it('restores a valid stored session', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(first));
    await useSessionStore.getState().restore();
    expect(useSessionStore.getState()).toMatchObject({ session: first, ready: true });
    expect(deleteCache).not.toHaveBeenCalled();
  });
  it('purges an earlier focus draft on every fresh login, including the same account', async () => {
    useSessionStore.setState({ session: first, ready: true });
    await useSessionStore.getState().setSession({ ...first, accessToken: 'renewed-token' });
    expect(deleteCache).toHaveBeenCalledWith(first.user.id, 'focus-draft:v1');
    expect(jest.mocked(deleteCache).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(SecureStore.setItemAsync).mock.invocationCallOrder[0]);
  });

  it('clears local state without waiting for an offline logout request', async () => {
    let release!: () => void;
    global.fetch = jest.fn().mockImplementation((_url, init: RequestInit) => new Promise<void>(resolve => {
      release = resolve; init.signal?.addEventListener('abort', () => resolve());
    }));
    useSessionStore.setState({ session: first, ready: true });
    queryClient.setQueryData(['account', first.user.id, 'tasks'], [{ title: 'Private task' }]);
    const logout = useSessionStore.getState().signOut();
    expect(useSessionStore.getState().session).toBeNull();
    expect(queryClient.getQueryData(['account', first.user.id, 'tasks'])).toBeUndefined();
    await logout;
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    expect(clearAccountCache).toHaveBeenCalledWith(first.user.id);
    expect(clearScheduledReminders).toHaveBeenCalled();
    release();
  });

  it('finishes account cleanup before persisting a newly signed-in session', async () => {
    let finish!: () => void;
    jest.mocked(clearAccountCache).mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    useSessionStore.setState({ session: first, ready: true });
    const logout = useSessionStore.getState().signOut();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const login = useSessionStore.getState().setSession(second);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    finish(); await logout; await login;
    expect(useSessionStore.getState().session).toEqual(second);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('campusflow.session.v1', JSON.stringify(second));
  });

  it('does not let a delayed startup restore overwrite a newer login', async () => {
    let finish!: (value: string) => void;
    jest.mocked(SecureStore.getItemAsync).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const restore = useSessionStore.getState().restore();
    await useSessionStore.getState().setSession(second);
    finish(JSON.stringify(first)); await restore;
    expect(useSessionStore.getState().session).toEqual(second);
  });
});
