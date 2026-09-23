import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, json } from '@/lib/api';
import type { AcademicItem, CampusEvent, Goal, NotificationPreferences, PersonalTask, Reminder, Today, WellnessEntry } from '@/lib/types';
import { useSessionStore } from '@/store/session';
import { readCache, writeCache } from '@/services/cache';
function cachedQuery<T>(key: string, path: string) {
  const client = useQueryClient(); const accountId = useSessionStore(s => s.session?.user.id);
  return useQuery({ enabled: !!accountId, queryKey: ['account', accountId, key], queryFn: async () => {
    if (!accountId) throw new Error('Your session has ended.');
    const cached = await readCache<T>(accountId, key);
    if (cached !== undefined) {
      void api<T>(path).then(async fresh => {
        if (useSessionStore.getState().session?.user.id !== accountId) return;
        await writeCache(accountId, key, fresh); client.setQueryData(['account', accountId, key], fresh);
      }).catch(async error => { if (error instanceof Error && 'status' in error && (error as { status: number }).status === 401) await useSessionStore.getState().signOut(); });
      return cached;
    }
    const fresh = await api<T>(path);
    if (useSessionStore.getState().session?.user.id === accountId) await writeCache(accountId, key, fresh);
    return fresh;
  } });
}
export const useToday = (date: string) => cachedQuery<Today>(`today:${date}`, `/today?date=${date}`);
export const useTasks = () => cachedQuery<PersonalTask[]>('tasks', '/tasks');
export const useAcademic = () => cachedQuery<AcademicItem[]>('academic', '/academic-items');
export const useGoals = () => cachedQuery<Goal[]>('goals', '/goals');
export const useEvents = () => cachedQuery<CampusEvent[]>('events', '/events');
export const useWellness = () => cachedQuery<WellnessEntry[]>('wellness', '/wellness');
export const usePreferences = () => cachedQuery<NotificationPreferences>('preferences', '/notification-preferences');
export const useReminders = () => cachedQuery<Reminder[]>('reminders', '/reminders');
export function useAction<T = unknown>() { const client = useQueryClient(); return useMutation({ mutationFn: ({ path, method = 'POST', body }: { path: string; method?: string; body?: unknown }) => api<T>(path, json(method, body)), onSuccess: async () => { await client.invalidateQueries(); } }); }
export function useTaskMutation() { return useAction<PersonalTask>(); }
