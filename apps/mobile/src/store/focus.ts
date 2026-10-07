import { create } from 'zustand';
import { advanceFocusTimer, createFocusTimer, pauseFocusTimer, startFocusTimer, type FocusTimer } from '@/features/focus-timer';
import { useSessionStore } from './session';
import type { Session } from '@/lib/types';

export const focusOwner = (session: Session | null) => session ? JSON.stringify([session.user.id, session.accessToken]) : null;
export type FocusTarget = { id: string; title: string };
type State = {
  owner: string | null; timer: FocusTimer; target: FocusTarget | null; taskCompleted: boolean;
  configure(owner: string, minutes: number, target?: FocusTarget | null): void;
  start(owner: string): void; pause(owner: string): void; reset(owner: string): void;
  takeBreak(owner: string): void; completeTarget(owner: string, id: string): void; clear(): void;
};
const initial = () => ({ owner: null, timer: createFocusTimer(), target: null, taskCompleted: false });
// Transient UI state only: no session history, token, or timer is persisted.
export const useFocusStore = create<State>((set, get) => {
  const valid = (owner: string) => owner === focusOwner(useSessionStore.getState().session);
  const owns = (owner: string) => valid(owner) && get().owner === owner;
  return {
    ...initial(),
    configure(owner, minutes, target) {
      if (!valid(owner)) return;
      const current = get();
      if (current.owner === owner && ['running', 'paused'].includes(current.timer.status)) return;
      set({ owner, timer: createFocusTimer(minutes), ...(target !== undefined ? { target, taskCompleted: false } : {}) });
    },
    start(owner) { if (owns(owner)) set({ timer: startFocusTimer(get().timer, Date.now()) }); },
    pause(owner) { if (owns(owner)) set({ timer: pauseFocusTimer(get().timer, Date.now()) }); },
    reset(owner) { if (owns(owner)) set({ timer: createFocusTimer(get().timer.phase === 'focus' ? get().timer.durationMs / 60_000 : 25) }); },
    takeBreak(owner) {
      const timer = advanceFocusTimer(get().timer, Date.now());
      if (owns(owner) && timer.phase === 'focus' && timer.status === 'finished') set({ timer: startFocusTimer(createFocusTimer(5, 'break'), Date.now()) });
    },
    completeTarget(owner, id) { if (owns(owner) && get().target?.id === id) set({ taskCompleted: true }); },
    clear() { set(initial()); },
  };
});

// Clear immediately on logout, account switch, or a new login for the same user.
useSessionStore.subscribe((next, previous) => {
  if (focusOwner(next.session) !== focusOwner(previous.session)) useFocusStore.getState().clear();
});
