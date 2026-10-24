import { create } from 'zustand';
import { gymDraftSchema, type DraftSet, type GymDraft } from '@/features/gym';
import { deleteCache, readCache, writeCache } from '@/services/cache';
import { useSessionStore } from './session';
import type { Session } from '@/lib/types';

export const gymOwner = (session: Session | null) => session ? JSON.stringify([session.user.id, session.accessToken]) : null;
const cacheKey = 'gymDraft';
type State = {
  draft: GymDraft | null; restored: string | null;
  restore(owner: string): Promise<void>; start(draft: GymDraft): void; discard(): void;
  updateSet(exercise: number, set: number, change: Partial<DraftSet>): void; addSet(exercise: number): void; removeSet(exercise: number): void;
  setNote(note: string): void;
};
const accountOf = (owner: string) => (JSON.parse(owner) as [string, string])[0];
const current = (owner: string) => owner === gymOwner(useSessionStore.getState().session);
/** Mirrors the draft to the account-scoped device cache; sign-out clears it with every other snapshot. */
const persist = (draft: GymDraft | null, owner: string) => {
  const save = draft ? writeCache(accountOf(owner), cacheKey, draft, () => current(owner)) : deleteCache(accountOf(owner), cacheKey, () => current(owner));
  void save.catch(() => undefined);
};

export const useGymWorkout = create<State>((set, get) => {
  const edit = (change: (draft: GymDraft) => GymDraft) => {
    const draft = get().draft;
    if (!draft || !current(draft.owner)) return;
    const next = change(draft); set({ draft: next }); persist(next, draft.owner);
  };
  const exercises = (draft: GymDraft, index: number, change: (sets: DraftSet[]) => DraftSet[]) =>
    ({ ...draft, exercises: draft.exercises.map((entry, position) => position === index ? { ...entry, sets: change(entry.sets) } : entry) });
  return {
    draft: null, restored: null,
    async restore(owner) {
      if (get().restored === owner) return;
      const draft = get().draft;
      if (draft?.owner === owner) { set({ restored: owner }); return; }
      const cached = gymDraftSchema.safeParse(await readCache<unknown>(accountOf(owner), cacheKey).catch(() => undefined));
      // A draft from another account or token generation is never shown; a workout started meanwhile wins.
      if (!current(owner) || get().restored === owner) return;
      set({ restored: owner, draft: cached.success && accountOf(cached.data.owner) === accountOf(owner) ? { ...cached.data, owner } : null });
    },
    start(draft) { if (!current(draft.owner)) return; set({ draft, restored: draft.owner }); persist(draft, draft.owner); },
    discard() { const draft = get().draft; set({ draft: null }); if (draft) persist(null, draft.owner); },
    updateSet(exercise, index, change) { edit(draft => exercises(draft, exercise, sets => sets.map((item, position) => position === index ? { ...item, ...change } : item))); },
    addSet(exercise) { edit(draft => exercises(draft, exercise, sets => sets.length >= 12 ? sets
      : [...sets, { ...(sets[sets.length - 1] ?? { weight: '', reps: '' }), done: false }])); },
    removeSet(exercise) { edit(draft => exercises(draft, exercise, sets => sets.length > 1 ? sets.slice(0, -1) : sets)); },
    setNote(note) { edit(draft => ({ ...draft, note: note.slice(0, 500) })); },
  };
});
