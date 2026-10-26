import { z } from 'zod';
import type { Reminder } from '@campusflow/contracts';
import { idSchema } from '@campusflow/contracts';
import { readCache, writeCache } from './cache';
import { useReminderStatus } from '@/store/reminder-status';

const key = 'task-reminder-suppression:v1';
const schema = z.array(z.object({ taskId: idSchema, allowedIds: z.array(idSchema) }));
const recoverySchema = z.object({ entries: schema, recoveryIds: z.array(idSchema).nullable() });
type Entry = z.infer<typeof schema>[number];
type State = { entries: Map<string, Entry>; loaded: boolean; loading?: Promise<void>; epoch: number;
  recoveryIds?: string[] | null; dirty: boolean; pending: Promise<void> };
const accounts = new Map<string, State>();
const listeners = new Set<() => void>();
let revision = 0;
const publish = () => { revision++; listeners.forEach(listener => listener()); };
export const taskReminderRevision = () => revision;
export function subscribeTaskReminders(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function stateFor(accountId: string) {
  let state = accounts.get(accountId);
  if (!state) { state = { entries: new Map(), loaded: false, epoch: 0, dirty: false, pending: Promise.resolve() }; accounts.set(accountId, state); }
  return state;
}
export const taskReminderReadEpoch = (accountId: string) => stateFor(accountId).epoch;
export const taskRemindersLoaded = (accountId: string) => stateFor(accountId).loaded;
export function resetTaskReminderSuppression() { accounts.clear(); publish(); }

export async function loadTaskReminderSuppression(accountId: string): Promise<void> {
  const state = stateFor(accountId);
  if (state.loaded) return;
  if (!state.loading) {
    state.loading = (async () => {
      const cached = await readCache(accountId, key);
      const legacy = schema.safeParse(cached === undefined ? [] : cached);
      const recovered = recoverySchema.safeParse(cached);
      const stored = legacy.success ? legacy.data : recovered.success ? recovered.data.entries : [];
      // Corruption loses suppression knowledge: fail closed until an owned,
      // current server read supplies an allow-list. Never trust old task caches.
      if (!legacy.success) {
        state.recoveryIds = recovered.success ? recovered.data.recoveryIds : null;
        if (!recovered.success) state.dirty = true;
      }
      // A mutation may have been acknowledged while SQLite was reading.
      for (const entry of stored) if (!state.entries.has(entry.taskId)) state.entries.set(entry.taskId, entry);
      state.loaded = true; publish();
    })().finally(() => { state.loading = undefined; });
  }
  await state.loading;
}

/** Synchronous barrier: older reads and queued native work must see the acknowledgment immediately. */
export function confirmTaskReminderSuppression(accountId: string, taskId: string) {
  const state = stateFor(accountId);
  state.entries.set(taskId, { taskId, allowedIds: [] }); state.epoch++; state.dirty = true; publish();
}

export function filterTaskReminders(accountId: string, reminders: Reminder[]): Reminder[] {
  const state = stateFor(accountId);
  return reminders.filter(reminder => {
    if (reminder.targetKind === 'personalTask' && state.recoveryIds !== undefined
      && !state.recoveryIds?.includes(reminder.id)) return false;
    const entry = reminder.targetKind === 'personalTask' ? state.entries.get(reminder.targetId) : undefined;
    return !entry || entry.allowedIds.includes(reminder.id);
  });
}

/** Retry only local persistence; never repeat a server mutation. */
export async function persistTaskReminderSuppression(accountId: string, isCurrent: () => boolean): Promise<void> {
  const state = stateFor(accountId);
  const operation = state.pending.catch(() => undefined).then(async () => {
    await loadTaskReminderSuppression(accountId);
    if (!isCurrent() || accounts.get(accountId) !== state) return;
    if (state.dirty) {
      const epoch = state.epoch;
      const entries = [...state.entries.values()];
      const stored = state.recoveryIds === undefined ? entries : { entries, recoveryIds: state.recoveryIds };
      await writeCache(accountId, key, stored, () => isCurrent() && accounts.get(accountId) === state);
      if (isCurrent() && state.epoch === epoch) state.dirty = false;
    }
    if (isCurrent()) useReminderStatus.setState(status => ({ accountId, persistenceError: undefined, error: status.accountId === accountId ? status.error : undefined }));
  });
  state.pending = operation;
  try { await operation; }
  catch (error) {
    if (isCurrent()) useReminderStatus.setState(status => ({ accountId, error: status.accountId === accountId ? status.error : undefined,
      persistenceError: 'Your task change is saved. Couldn’t save reminder cleanup on this device. Retry reminders in Settings before closing the app.' }));
    throw error;
  }
}

/** Only a read started after the acknowledgment can authorize delivery again (including undo). */
export async function acceptTaskReminderRead(accountId: string, reminders: Reminder[], epoch: number, isCurrent: () => boolean): Promise<boolean> {
  const state = stateFor(accountId);
  await loadTaskReminderSuppression(accountId);
  if (!isCurrent() || accounts.get(accountId) !== state || state.epoch !== epoch) return false;
  if (state.recoveryIds !== undefined) {
    state.recoveryIds = reminders.filter(reminder => reminder.targetKind === 'personalTask').map(reminder => reminder.id);
    state.dirty = true;
  }
  if (state.entries.size || state.dirty) {
    for (const entry of state.entries.values()) entry.allowedIds = reminders
      .filter(reminder => reminder.targetKind === 'personalTask' && reminder.targetId === entry.taskId).map(reminder => reminder.id);
    // Keep the allow-list after fresh reads so older SQLite fallbacks cannot
    // resurrect a retired ID. Undo may authorize the new API intent immediately.
    state.epoch++; state.dirty = true; publish();
    await persistTaskReminderSuppression(accountId, isCurrent).catch(() => undefined);
  }
  return isCurrent() && accounts.get(accountId) === state;
}
