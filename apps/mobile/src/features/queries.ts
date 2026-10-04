import { useEffect, useState } from 'react';
import { CancelledError, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, json } from '@/lib/api';
import type { AcademicItem, CampusEvent, Goal, NotificationPreferences, PersonalTask, Reminder, Today, WellnessEntry } from '@/lib/types';
import { useSessionStore } from '@/store/session';
import { readCache, writeCache } from '@/services/cache';

function cachedQuery<T>(key: string, path: string) {
  const session = useSessionStore(state => state.session);
  const accountId = session?.user.id;
  const token = session?.accessToken;
  const [saved, setSaved] = useState<{ token: string; key: string; data: T }>();
  const isCurrent = () => useSessionStore.getState().session?.accessToken === token;

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    void readCache<T>(accountId, key).then(cached => {
      // SQLite may finish after the network or after sign-out. Keep it as a
      // fallback, so loading it cannot erase a refresh error or a fresh result.
      if (active && useSessionStore.getState().session?.accessToken === token
        && token && cached !== undefined) {
        setSaved({ token, key, data: cached });
      }
    }).catch(() => { /* Server data remains usable if the disposable cache fails. */ });
    return () => { active = false; };
  }, [accountId, token, key]);

  const query = useQuery({
    enabled: !!accountId, queryKey: ['account', accountId, key],
    queryFn: async ({ signal }) => {
      if (!accountId || !isCurrent()) throw new CancelledError();
      try {
        const fresh = await api<T>(path, { signal });
        if (signal.aborted || !isCurrent()) throw new CancelledError();
        // Cache failure must not turn a successful server read into an error.
        await writeCache(accountId, key, fresh).catch(() => undefined);
        if (signal.aborted || !isCurrent()) throw new CancelledError();
        return fresh;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && isCurrent()) {
          await useSessionStore.getState().signOut();
        }
        throw error;
      }
    },
  });
  const data = query.data ?? (saved?.token === token && saved?.key === key ? saved.data : undefined);
  return { ...query, data, isLoading: query.isLoading && data === undefined };
}

export const useToday = (date: string) => cachedQuery<Today>(`today:${date}`, `/today?date=${date}`);
export const useTasks = () => cachedQuery<PersonalTask[]>('tasks', '/tasks');
export const useAcademic = () => cachedQuery<AcademicItem[]>('academic', '/academic-items');
export const useGoals = () => cachedQuery<Goal[]>('goals', '/goals');
export const useEvents = () => cachedQuery<CampusEvent[]>('events', '/events');
export const useWellness = () => cachedQuery<WellnessEntry[]>('wellness', '/wellness');
export const usePreferences = () => cachedQuery<NotificationPreferences>('preferences', '/notification-preferences');
export const useReminders = () => cachedQuery<Reminder[]>('reminders', '/reminders');

type ActionRequest = { path: string; method?: string; body?: unknown };
export function useAction<T = unknown>() {
  const client = useQueryClient();
  const session = useSessionStore(state => state.session);
  const mutation = useMutation({
    onMutate: async ({ owner }) => {
      if (!owner || useSessionStore.getState().session?.accessToken !== owner.accessToken) throw new Error('Your session has ended.');
      await client.cancelQueries({ queryKey: ['account', owner.user.id] });
    },
    mutationFn: async ({ request: { path, method = 'POST', body }, owner }: { request: ActionRequest; owner: typeof session }) => {
      // Recheck after cancellation: an account switch must not submit an old
      // screen's write using the new account's credentials.
      if (!owner || useSessionStore.getState().session?.accessToken !== owner.accessToken) throw new Error('Your session has ended.');
      return api<T>(path, json(method, body));
    },
    onSuccess: async (_data, { owner }) => {
      if (owner && useSessionStore.getState().session?.accessToken === owner.accessToken) {
        await client.invalidateQueries({ queryKey: ['account', owner.user.id] });
      }
    },
    onError: async (error, { owner }) => {
      if (error instanceof ApiError && error.status === 401 && owner && useSessionStore.getState().session?.accessToken === owner.accessToken) {
        await useSessionStore.getState().signOut();
      }
    },
  });
  // Capture ownership when the action is invoked, including across awaited
  // cancellation and hook rerenders during an account transition.
  return { ...mutation,
    mutate: (request: ActionRequest) => mutation.mutate({ request, owner: session }),
    mutateAsync: (request: ActionRequest) => mutation.mutateAsync({ request, owner: session }),
  };
}
export function useTaskMutation() { return useAction<PersonalTask>(); }
