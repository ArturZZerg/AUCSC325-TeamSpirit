import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { Workout } from '@campusflow/contracts';
import { gymOwner, useGymWorkout } from '@/store/gym-workout';
import { useSessionStore } from '@/store/session';
import { draftProgress, draftToWorkout, isWorkoutIdle, lastActivity, ownGym } from './gym';
import { useAction, useGym } from './queries';

const checkEveryMs = 30_000;
/** Request keys being saved, so two mounted screens never submit the same draft twice. */
const saving = new Set<string>();

/**
 * Closes a workout nobody has touched for 30 minutes (workoutIdleMs). Ticked sets are saved with the
 * last activity as the end time, so the recorded duration excludes the idle tail; a draft with no
 * ticked sets is dropped. A draft that fails validation or cannot be sent stays for the student.
 */
export function useWorkoutAutoFinish() {
  const owner = gymOwner(useSessionStore(state => state.session));
  const gym = useGym(); const action = useAction<Workout>();
  const latest = useRef({ owner, gym, action }); latest.current = { owner, gym, action };
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { owner: current, gym: overview, action: save } = latest.current;
      const store = useGymWorkout.getState(), draft = store.draft;
      if (!current || !draft || draft.owner !== current || saving.has(draft.requestKey) || !isWorkoutIdle(draft, Date.now())) return;
      if (draftProgress(draft).done === 0) { store.discard(); store.setAutoFinished({ owner: current, title: draft.title, workout: null }); return; }
      let body;
      try { body = draftToWorkout(draft, new Date(lastActivity(draft)), ownGym(overview.data).exercises); } catch { return; }
      saving.add(draft.requestKey);
      try {
        const workout = await save.mutateAsync({ path: '/gym/workouts', body });
        const now = useGymWorkout.getState();
        if (now.draft?.requestKey !== draft.requestKey) return;
        now.discard(); now.setAutoFinished({ owner: draft.owner, title: draft.title, workout });
      } catch { /* Offline or rejected: the draft and its save key stay, so a later retry cannot duplicate it. */ }
      finally { saving.delete(draft.requestKey); }
    };
    const run = () => { if (mounted) void check(); };
    run();
    const timer = setInterval(run, checkEveryMs);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') run(); });
    return () => { mounted = false; clearInterval(timer); listener.remove(); };
  }, []);
}
