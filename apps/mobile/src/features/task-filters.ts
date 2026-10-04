import { useEffect, useState } from 'react';
import type { PersonalTask } from '@/lib/types';
export type TaskFilters = { search: string; category: PersonalTask['category'] | 'all'; completion: 'all' | 'open' | 'completed' };
export const defaultTaskFilters: TaskFilters = { search: '', category: 'all', completion: 'all' };
export function filterPersonalTasks(tasks: readonly PersonalTask[], filters: TaskFilters): PersonalTask[] {
  const search = filters.search.trim().toLowerCase();
  return tasks.filter(task => (filters.category === 'all' || task.category === filters.category)
    && (filters.completion === 'all' || Boolean(task.completedAt) === (filters.completion === 'completed'))
    && (!search || task.title.toLowerCase().includes(search) || task.description?.toLowerCase().includes(search)));
}
export function useTaskFilters(accountId: string | undefined) {
  const [saved, setSaved] = useState({ accountId, filters: defaultTaskFilters });
  useEffect(() => { setSaved(previous => previous.accountId === accountId ? previous : { accountId, filters: defaultTaskFilters }); }, [accountId]);
  // Reset synchronously at the account boundary, before an effect can run.
  const filters = saved.accountId === accountId ? saved.filters : defaultTaskFilters;
  const update = (patch: Partial<TaskFilters>) => setSaved(previous => ({ accountId,
    filters: { ...(previous.accountId === accountId ? previous.filters : defaultTaskFilters), ...patch } }));
  const reset = () => setSaved({ accountId, filters: defaultTaskFilters });
  return { filters, update, reset };
}
