import { useEffect, useMemo, useRef, useState } from 'react';
import { CancelledError, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academicItemSchema, campusEventSchema, goalCompletionSchema, goalSchema, notificationPreferencesSchema, offlineSnapshotSchema, personalTaskSchema, reminderSchema, todayResponseSchema, wellnessEntrySchema } from '@campusflow/contracts';
import { z } from 'zod';
import { api, ApiError, json } from '@/lib/api';
import type { AcademicItem, CampusEvent, Goal, NotificationPreferences, PersonalTask, Reminder, Today, WellnessEntry } from '@/lib/types';
import { useSessionStore } from '@/store/session';
import { readCache, writeCache } from '@/services/cache';
import { useTodayClock } from '@/features/today-clock';
import { composeOfflineToday } from '@/features/offline-today';

const schemas = {
  tasks: personalTaskSchema.array(), academic: academicItemSchema.array(), goals: goalSchema.array(),
  events: campusEventSchema.array(),
  wellness: wellnessEntrySchema.array(), reminders: reminderSchema.array(),
  goalHistory: goalCompletionSchema.array(),
};

function cachedQuery<T>(key: string, path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, cacheKey = key) {
  const session = useSessionStore(state => state.session);
  const accountId = session?.user.id;
  const token = session?.accessToken;
  const [saved, setSaved] = useState<{ token: string; key: string; data: T }>();
  const isCurrent = () => useSessionStore.getState().session?.accessToken === token;

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    void readCache<T>(accountId, cacheKey).then(cached => {
      // SQLite may finish after the network or after sign-out. Keep it as a
      // fallback, so loading it cannot erase a refresh error or a fresh result.
      const valid = schema.safeParse(cached);
      if (active && useSessionStore.getState().session?.accessToken === token && token && valid.success) {
        setSaved({ token, key, data: valid.data });
      }
    }).catch(() => { /* Server data remains usable if the disposable cache fails. */ });
    return () => { active = false; };
  }, [accountId, token, key, cacheKey, schema]);

  const query = useQuery({
    enabled: !!accountId, queryKey: ['account', accountId, key],
    queryFn: async ({ signal }) => {
      if (!accountId || !isCurrent()) throw new CancelledError();
      try {
        const fresh = schema.parse(await api<unknown>(path, { signal }));
        if (signal.aborted || !isCurrent()) throw new CancelledError();
        // Cache failure must not turn a successful server read into an error.
        await writeCache(accountId, cacheKey, fresh).catch(() => undefined);
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
  const savedData = saved?.token === token && saved?.key === key ? saved.data : undefined;
  const data = query.data ?? savedData;
  return { ...query, data, savedData, isCached: query.data === undefined, isLoading: query.isLoading && data === undefined };
}

export function useToday(selectedDate?: string) {
  const session = useSessionStore(state => state.session);
  const timeZone = session?.user.timeZone ?? 'UTC';
  const { date, resumeCount } = useTodayClock(timeZone, selectedDate);
  const query = cachedQuery<Today>(`today:${date}`, `/today?date=${date}`, todayResponseSchema);
  const snapshotSchema = useMemo(() => offlineSnapshotSchema.refine(value =>
    value.accountId === session?.user.id && value.timeZone === timeZone
      && value.coverage.from <= date && value.coverage.through >= date,
  'Snapshot does not cover this account calendar'), [session?.user.id, timeZone, date]);
  const snapshot = cachedQuery(`snapshot:${date}:${timeZone}`, `/snapshot?date=${date}`, snapshotSchema, 'snapshot');
  const snapshotData = snapshot.savedData && (!snapshot.data || Date.parse(snapshot.savedData.capturedAt) > Date.parse(snapshot.data.capturedAt))
    ? snapshot.savedData : snapshot.data;
  const offline = session ? composeOfflineToday(snapshotData, session.user.id, timeZone, date, new Date().toISOString()) : undefined;
  const validToday = query.data?.date === date && query.data.timeZone === timeZone ? query.data : undefined;
  const data = validToday && ((!query.isCached && !query.isError) || !offline || Date.parse(validToday.generatedAt) >= Date.parse(offline.generatedAt)) ? validToday : offline;
  const lastRefresh = useRef({ resumeCount, timeZone });

  useEffect(() => {
    if (lastRefresh.current.resumeCount === resumeCount && lastRefresh.current.timeZone === timeZone) return;
    lastRefresh.current = { resumeCount, timeZone };
    if (session) {
      // A changed date already starts its own query. Join that request instead
      // of cancelling it; a same-day resume refreshes even a still-fresh cache.
      void query.refetch({ cancelRefetch: false });
      void snapshot.refetch({ cancelRefetch: false });
    }
  }, [resumeCount, timeZone, query.refetch, snapshot.refetch, session]);

  const refetch: typeof query.refetch = async options => {
    const [today] = await Promise.all([query.refetch(options), snapshot.refetch(options)]);
    return today;
  };
  return { ...query, data, refetch, isRefetching: query.isRefetching || snapshot.isRefetching,
    isLoading: query.isLoading && data === undefined, date, timeZone };
}
export const useTasks = () => cachedQuery<PersonalTask[]>('tasks', '/tasks', schemas.tasks);
export const useAcademic = () => cachedQuery<AcademicItem[]>('academic', '/academic-items', schemas.academic);
export const useGoals = () => cachedQuery<Goal[]>('goals', '/goals', schemas.goals);
export function useGoalHistory(goalId: string) {
  const schema = useMemo(() => schemas.goalHistory.refine(rows => rows.every(row => row.goalId === goalId), 'History belongs to another goal'), [goalId]);
  return cachedQuery(`goalHistory:${goalId}`, `/goals/${goalId}/history`, schema);
}
export const useEvents = () => cachedQuery<CampusEvent[]>('events', '/events', schemas.events);
export const useWellness = () => cachedQuery<WellnessEntry[]>('wellness', '/wellness', schemas.wellness);
export const usePreferences = () => cachedQuery<NotificationPreferences>('preferences', '/notification-preferences', notificationPreferencesSchema);
export const useReminders = () => cachedQuery<Reminder[]>('reminders', '/reminders', schemas.reminders);

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
