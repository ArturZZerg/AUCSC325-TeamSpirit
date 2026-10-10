import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { dayBounds, localDateAt } from '@campusflow/domain';

/** Minute-level next-class/remaining-window updates while viewing the current day. */
export function useAgendaClock(date: string, timeZone: string) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    let active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer); timer = undefined;
      const instant = new Date(); setNow(instant.toISOString());
      if (!active) return;
      const current = localDateAt(instant.toISOString(), timeZone);
      if (current > date) return;
      const delay = current === date ? 60000 - instant.getTime() % 60000
        : Math.max(1, Date.parse(dayBounds(current, timeZone).end) - instant.getTime());
      timer = setTimeout(schedule, delay);
    };
    const subscription = AppState.addEventListener('change', state => { active = state === 'active'; schedule(); });
    schedule();
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [date, timeZone]);
  return now;
}
