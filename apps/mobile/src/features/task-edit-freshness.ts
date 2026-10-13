import { useSyncExternalStore } from 'react';
import type { Session } from '@/lib/types';
import { useSessionStore } from '@/store/session';

type Writes = { generation: number; outstanding: number };
export type TaskEditBaseline = { owner: Session; taskId: string; generation: number; accountGeneration: number; ownershipGeneration: number; credentialsGeneration: number };
const accounts = new Map<string, { accountId: string; writes: Writes; tasks: Map<string, Writes> }>();
const listeners = new Set<() => void>();
let revision = 0;
let ownershipGeneration = 0;
let credentialsGeneration = 0;
export const taskOwnershipGeneration = () => ownershipGeneration;
export const taskCredentialsGeneration = () => credentialsGeneration;
const publish = () => { revision++; listeners.forEach(listener => listener()); };
const ownerKey = (owner: Session) => JSON.stringify([owner.user.id, owner.accessToken]);
function pruneObsoleteOwners() {
  const current = useSessionStore.getState().session;
  for (const [key, value] of accounts) if (key !== (current && ownerKey(current))
    && !value.writes.outstanding && ![...value.tasks.values()].some(task => task.outstanding)) accounts.delete(key);
}
useSessionStore.subscribe?.((state, previous) => {
  const identity = (session: Session | null) => session && JSON.stringify([session.user.id, session.accessToken, session.user.timeZone]);
  const credentials = (session: Session | null) => session && JSON.stringify([session.user.id, session.accessToken]);
  if (credentials(state.session) !== credentials(previous.session)) credentialsGeneration++;
  if (identity(state.session) !== identity(previous.session)) {
    ownershipGeneration++;
    // A request already sent under an old token can still commit. Retain its
    // barrier until settlement, including logout/login and timezone changes.
    for (const [key, value] of accounts) if (!value.writes.outstanding && ![...value.tasks.values()].some(task => task.outstanding)) accounts.delete(key);
    publish();
  }
});
const account = (owner: Session) => {
  const key = ownerKey(owner);
  let value = accounts.get(key);
  if (!value) { value = { accountId: owner.user.id, writes: { generation: 0, outstanding: 0 }, tasks: new Map() }; accounts.set(key, value); }
  return value;
};
const entity = (owner: Session, id: string) => {
  const tasks = account(owner).tasks;
  let value = tasks.get(id);
  if (!value) { value = { generation: 0, outstanding: 0 }; tasks.set(id, value); }
  return value;
};
export const taskOwnerCurrent = (owner: Session) => {
  const current = useSessionStore.getState().session;
  return current?.user.id === owner.user.id && current.accessToken === owner.accessToken && current.user.timeZone === owner.user.timeZone;
};
export function taskEditBaseline(owner: Session, taskId: string): TaskEditBaseline | undefined {
  if (!taskOwnerCurrent(owner) || pendingTaskWrite(owner, taskId)) return;
  const task = entity(owner, taskId), all = account(owner).writes;
  return { owner, taskId, generation: task.generation, accountGeneration: all.generation, ownershipGeneration, credentialsGeneration };
}
function pendingTaskWrite(owner: Session, taskId: string) {
  return [...accounts.values()].some(value => value.accountId === owner.user.id
    && (value.writes.outstanding || value.tasks.get(taskId)?.outstanding));
}
export function taskEditBaselineCurrent(baseline: TaskEditBaseline) {
  const current = taskEditBaseline(baseline.owner, baseline.taskId);
  return current?.generation === baseline.generation && current.accountGeneration === baseline.accountGeneration
    && current.ownershipGeneration === baseline.ownershipGeneration;
}
export function taskEditWriteCurrent(baseline: TaskEditBaseline) {
  if (!taskOwnerCurrent(baseline.owner) || baseline.ownershipGeneration !== ownershipGeneration) return false;
  const task = entity(baseline.owner, baseline.taskId), all = account(baseline.owner).writes;
  return task.generation === baseline.generation + 1 && task.outstanding === 1
    && all.generation === baseline.accountGeneration && !all.outstanding;
}
export function useTaskEditRevision() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => revision);
}
// Main Goal assignment can also clear another task's flag. Account-wide writes
// invalidate every editor; ordinary task writes invalidate only that entity.
export function beginTaskWrite(owner: Session, path: string) {
  const match = /^\/tasks(?:\/([^/?]+))?(?:\/|$)/.exec(path);
  const all = /\/main-goal$/.test(path) || path === '/tasks';
  if (!match && !all) return;
  const writes = all ? account(owner).writes : entity(owner, match![1]);
  writes.generation++; writes.outstanding++; publish();
  let ended = false;
  return () => { if (!ended) { ended = true; writes.outstanding--; pruneObsoleteOwners(); publish(); } };
}
