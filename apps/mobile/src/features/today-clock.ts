import { useEffect, useReducer, useState } from 'react';
import { AppState } from 'react-native';
import { dayBounds, localDateAt } from '@campusflow/domain';

/** A selected calendar date stays fixed; the default follows the account zone. */
export function useTodayClock(timeZone: string, selectedDate?: string, rolloverTimeZones: readonly string[] = []) {
  const [, tick] = useReducer(value => value + 1, 0);
  const [resumeCount, setResumeCount] = useState(0);
  const date = selectedDate ?? localDateAt(new Date().toISOString(), timeZone);
  const zonesKey = [...new Set([timeZone, ...rolloverTimeZones])].sort().join('|');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previousState = AppState.currentState;
    let active = previousState !== 'background' && previousState !== 'inactive';
    const cancelTimer = () => { clearTimeout(timer); timer = undefined; };
    const schedule = () => {
      cancelTimer();
      if (!active) return;
      const now = new Date();
      const currentDate = localDateAt(now.toISOString(), timeZone);
      if (selectedDate !== undefined && selectedDate !== currentDate) return;
      // Midnight can pass between rendering and this effect subscribing.
      if (currentDate !== date) tick();
      // Calendar day bounds handle 23/25-hour DST days and offset changes.
      const midnight = Math.min(...zonesKey.split('|').map(zone =>
        Date.parse(dayBounds(localDateAt(now.toISOString(), zone), zone).end)));
      timer = setTimeout(() => {
        // A goal day can change while the account date/query key stays fixed.
        if (selectedDate !== undefined || localDateAt(new Date().toISOString(), timeZone) === date) setResumeCount(value => value + 1);
        tick(); schedule();
      }, Math.max(1, midnight - now.getTime()));
    };

    const subscription = AppState.addEventListener('change', nextState => {
      active = nextState === 'active';
      if (active && previousState !== 'active') {
        // Background timers can be suspended for multiple days. Read the clock
        // again before refreshing, rather than advancing the old date by one.
        tick();
        setResumeCount(value => value + 1);
      }
      previousState = nextState;
      schedule();
    });
    schedule();
    return () => { cancelTimer(); subscription.remove(); };
  }, [date, timeZone, selectedDate, zonesKey]);

  return { date, resumeCount };
}
