import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { reminderResponseTarget } from '@/services/reminder-response';
import { useSessionStore } from '@/store/session';

type Pending = { accountId: string; reminderId: string; token?: string };
export function ReminderResponseSync() {
  const router = useRouter(), navigation = useRootNavigationState();
  const { session, ready } = useSessionStore();
  const [pending, setPending] = useState<Pending>();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const seen = new Set<string>();
    const receive = (response: Notifications.NotificationResponse) => {
      if (!active) return;
      const target = reminderResponseTarget(response, Notifications.DEFAULT_ACTION_IDENTIFIER);
      if (!target) {
        try { Notifications.clearLastNotificationResponse(); } catch { /* Unsupported responses are never followed. */ }
        return;
      }
      const key = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (seen.size > 64) seen.delete(seen.values().next().value!);
      // Consumed/rejected responses cannot reopen private work after a later login.
      try { Notifications.clearLastNotificationResponse(); } catch { /* In-memory dedup still protects this mounted listener. */ }
      const current = useSessionStore.getState();
      if (current.ready && (!current.session || current.session.user.id !== target.accountId)) return;
      setPending({ ...target, token: current.session?.accessToken });
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(receive);
    try {
      const initial = Notifications.getLastNotificationResponse();
      if (initial) receive(initial);
    } catch { /* A native read failure must not disable future taps or startup. */ }
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!pending || !ready) return;
    // Restored auth context can reject a tap before the navigator mounts. Do
    // not retain it across a later matching login or stale session snapshot.
    if (!session || session.user.id !== pending.accountId || (pending.token && pending.token !== session.accessToken)) {
      setPending(undefined); return;
    }
    if (!navigation?.key) return;
    setPending(undefined);
    router.push({ pathname: '/reminders', params: { reminderId: pending.reminderId, accountId: pending.accountId } });
  }, [pending, ready, session, navigation?.key, router]);
  return null;
}
