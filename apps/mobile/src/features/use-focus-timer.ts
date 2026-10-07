import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { advanceFocusTimer, focusRemaining } from './focus-timer';
import { focusOwner, useFocusStore } from '@/store/focus';
import { useSessionStore } from '@/store/session';

export function useFocusTimer() {
  const session = useSessionStore(state => state.session);
  const owner = focusOwner(session);
  const state = useFocusStore();
  const [now, setNow] = useState(Date.now);
  const clock = Math.max(now, Date.now());
  const timer = advanceFocusTimer(state.timer, clock);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const refresh = () => setNow(Date.now());
    const schedule = (active: boolean) => {
      clearInterval(interval);
      if (active && state.timer.status === 'running') interval = setInterval(refresh, 250);
    };
    schedule(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    const subscription = AppState.addEventListener('change', status => { refresh(); schedule(status === 'active'); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [state.timer.status, state.timer.endsAt]);
  useEffect(() => {
    if (owner && owner === focusOwner(useSessionStore.getState().session) && useFocusStore.getState().owner === owner
      && useFocusStore.getState().timer === state.timer && timer !== state.timer) useFocusStore.setState({ timer });
  }, [owner, state.owner, state.timer, timer]);
  return { ...state, owner, storedOwner: state.owner, timer, remainingMs: focusRemaining(timer, clock) };
}
