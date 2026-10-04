import { useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';
import { usePreferences, useReminders } from '@/features/queries';
import { reconcileReminders } from '@/services/reminders';
import { useSessionStore } from '@/store/session';
import { colors } from '@/components/ui';
import { useReminderStatus } from '@/store/reminder-status';

export function DeviceReminderSync() {
  const reminders = useReminders();
  const preferences = usePreferences();
  const session = useSessionStore(state => state.session);
  const [resume, setResume] = useState(0);
  const failure = useReminderStatus();
  useEffect(() => {
    let active = true;
    const isCurrent = () => active && !!session && useSessionStore.getState().session?.accessToken === session.accessToken;
    if (session && reminders.data && preferences.data) {
      void reconcileReminders(reminders.data, { accountId: session.user.id, timeZone: session.user.timeZone,
        preferences: preferences.data, isCurrent }).catch(() => { /* The service exposes account-scoped retry status. */ });
    }
    return () => { active = false; };
  }, [session, reminders.data, preferences.data, reminders.dataUpdatedAt, preferences.dataUpdatedAt, resume]);

  useEffect(() => {
    let active = true;
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', state => {
      if (session && state === 'active' && previous !== 'active') {
        void Promise.all([reminders.refetch({ cancelRefetch: false }), preferences.refetch({ cancelRefetch: false })]).then(() => {
          if (active && useSessionStore.getState().session?.accessToken === session.accessToken) setResume(value => value + 1);
        }).catch(() => { /* Existing cached data remains usable after a read failure. */ });
      }
      previous = state;
    });
    return () => { active = false; subscription.remove(); };
  }, [session, reminders.refetch, preferences.refetch]);
  return session && failure.accountId === session.user.id && failure.error
    ? <Text accessibilityRole="alert" style={{ color: colors.coral, padding: 12 }}>{failure.error}</Text> : null;
}
