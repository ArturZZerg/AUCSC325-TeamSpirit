import { create } from 'zustand';
import { advanceFocusTimer, createFocusTimer, pauseFocusTimer, startFocusTimer, type FocusTimer } from '@/features/focus-timer';
import { useSessionStore } from './session';
import type { Session } from '@/lib/types';
import { saveFocusSessionSchema, type SaveFocusSession } from '@campusflow/contracts';
import type { FocusDraft } from '@/features/focus-recovery';

export const focusOwner = (session: Session | null) => session ? JSON.stringify([session.user.id, session.accessToken]) : null;
export type FocusTarget = { id: string; title: string };
type State = {
  owner: string | null; timer: FocusTimer; target: FocusTarget | null; taskCompleted: boolean;
  requestKey: string | null; recording: SaveFocusSession | null; recorded: boolean;
  recoveryReady: boolean; recoveredAt: number | null; storageError: string | null;
  recover(owner: string, draft: FocusDraft | null): void;
  configure(owner: string, minutes: number, target?: FocusTarget | null): void;
  start(owner: string): void; pause(owner: string): void; reset(owner: string): void;
  takeBreak(owner: string): void; completeTarget(owner: string, id: string): void; clear(): void;
  prepareRecord(owner: string): SaveFocusSession | null; markRecorded(owner: string, requestKey: string): boolean;
  detachRecord(owner: string): void;
};
const recordState = () => ({ requestKey: null, recording: null, recorded: false, recoveredAt: null });
const initial = () => ({ owner: null, timer: createFocusTimer(), target: null, taskCompleted: false, recoveryReady: true, storageError: null, ...recordState() });
const saveKey = () => `focus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
// Device drafts require explicit recovery/save. Only the API owns recorded history.
export const useFocusStore = create<State>((set, get) => {
  const valid = (owner: string) => owner === focusOwner(useSessionStore.getState().session) && get().recoveryReady;
  const owns = (owner: string) => valid(owner) && get().owner === owner;
  return {
    ...initial(),
    recover(owner, draft) {
      if (owner !== focusOwner(useSessionStore.getState().session)) return;
      set({ ...initial(), owner, recoveryReady: true, ...(draft ? {
        timer: draft.timer, target: draft.target, taskCompleted: draft.taskCompleted,
        requestKey: draft.requestKey, recording: draft.recording, recoveredAt: draft.checkpointAt,
      } : {}) });
    },
    configure(owner, minutes, target) {
      if (!valid(owner)) return;
      const current = get();
      if (current.owner === owner && ['running', 'paused'].includes(current.timer.status)) return;
      if (current.owner === owner && current.timer.phase === 'focus' && current.timer.startedAt !== null && !current.recorded) return;
      set({ owner, timer: createFocusTimer(minutes), ...recordState(), ...(target !== undefined ? { target, taskCompleted: false } : {}) });
    },
    start(owner) {
      if (!owns(owner) || get().recording) return;
      const current = get();
      set({ timer: startFocusTimer(current.timer, Date.now()), requestKey: current.requestKey ?? saveKey(), recoveredAt: null });
    },
    pause(owner) { if (owns(owner)) set({ timer: pauseFocusTimer(get().timer, Date.now()) }); },
    reset(owner) { if (owns(owner)) set({ timer: createFocusTimer(get().timer.phase === 'focus' ? get().timer.durationMs / 60_000 : 25), ...recordState() }); },
    takeBreak(owner) {
      const timer = advanceFocusTimer(get().timer, Date.now());
      if (owns(owner) && get().recorded && timer.phase === 'focus' && timer.status === 'finished') set({ timer: startFocusTimer(createFocusTimer(5, 'break'), Date.now()), ...recordState() });
    },
    prepareRecord(owner) {
      if (!owns(owner)) return null;
      const current = get();
      if (current.recording) return current.recording;
      if (current.recorded || current.timer.phase !== 'focus' || current.timer.startedAt === null || !current.requestKey) return null;
      const timer = pauseFocusTimer(current.timer, Date.now());
      const focusedSeconds = Math.floor((timer.durationMs - timer.remainingMs) / 1000);
      if (!focusedSeconds) return null;
      const result = saveFocusSessionSchema.safeParse({ requestKey: current.requestKey, taskId: current.target?.id ?? null,
        title: current.target?.title ?? 'Free study', startedAt: new Date(timer.startedAt!).toISOString(),
        endedAt: new Date(timer.finishedAt ?? current.recoveredAt ?? Date.now()).toISOString(), plannedMinutes: timer.durationMs / 60_000,
        focusedSeconds, outcome: timer.status === 'finished' ? 'completed' : 'interrupted' });
      if (!result.success) return null;
      set({ timer, recording: result.data });
      return result.data;
    },
    markRecorded(owner, requestKey) {
      if (!owns(owner) || get().requestKey !== requestKey) return false;
      set({ recorded: true, recording: null }); return true;
    },
    detachRecord(owner) {
      if (!owns(owner) || !get().recording) return;
      const requestKey = saveKey();
      set({ requestKey, recording: { ...get().recording!, requestKey, taskId: null } });
    },
    completeTarget(owner, id) { if (owns(owner) && get().target?.id === id) set({ taskCompleted: true }); },
    clear() { set(initial()); },
  };
});

// Clear immediately on logout, account switch, or a new login for the same user.
useSessionStore.subscribe((next, previous) => {
  if (focusOwner(next.session) !== focusOwner(previous.session)) useFocusStore.getState().clear();
});
