import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { useAction, usePreferences, useReminders } from '@/features/queries';
import { useSessionStore } from '@/store/session';
import { ensureNotificationPermission, reconcileReminders } from '@/services/reminders';
import { QuietHoursEditor } from '@/features/quiet-hours-editor';

const categories = [
  { key: 'academicEnabled', label: 'Academic' }, { key: 'personalEnabled', label: 'Personal' },
  { key: 'goalEnabled', label: 'Goal' }, { key: 'eventEnabled', label: 'Event' },
] as const;

export default function SettingsScreen() {
  const session = useSessionStore(state => state.session);
  const signOut = useSessionStore(state => state.signOut);
  const preferences = usePreferences();
  const reminders = useReminders();
  const action = useAction();
  const guard = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [editingQuietHours, setEditingQuietHours] = useState(false);
  const disabled = busy || action.isPending;
  const run = async (operation: () => Promise<void>) => {
    if (guard.current || action.isPending) return;
    guard.current = true; setBusy(true); setMessage(undefined);
    try { await operation(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update notifications. Please try again.'); }
    finally { guard.current = false; setBusy(false); }
  };
  const refresh = async () => {
    const [savedReminders, savedPreferences] = await Promise.all([reminders.refetch(), preferences.refetch()]);
    if (!session || useSessionStore.getState().session?.accessToken !== session.accessToken) return;
    const records = savedReminders.data ?? reminders.data;
    const settings = savedPreferences.data ?? preferences.data;
    if (!records || !settings) throw new Error('Connect to refresh your notification settings.');
    await reconcileReminders(records, { accountId: session.user.id, timeZone: session.user.timeZone,
      preferences: settings,
      isCurrent: () => useSessionStore.getState().session?.accessToken === session.accessToken });
  };

  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Settings</Text>
    <Card><Text style={styles.label}>Account</Text><Text style={styles.muted}>{session?.user.email}</Text>
      <Text style={styles.muted}>Time zone: {session?.user.timeZone}</Text><Button title="Sign out" tone="danger" onPress={() => void signOut()}/></Card>
    <Card><Text style={styles.label}>Canvas</Text><Text style={styles.muted}>Canvas authorization will appear here after the university approves a developer key, scopes, and HTTPS callback. This build does not ask for or store a personal Canvas token.</Text></Card>
    <Card><Text style={styles.label}>Notifications</Text><State loading={preferences.isLoading} error={preferences.error}/>
      {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
      <Button title="Allow device notifications" tone="plain" disabled={disabled} onPress={() => { void run(async () => {
        const granted = await ensureNotificationPermission();
        if (!granted) { setMessage('Device notifications are disabled. You can enable them in your device settings.'); return; }
        await refresh();
      }); }}/>
      <Button title={busy ? 'Updating…' : 'Refresh device reminders'} tone="plain" disabled={disabled} onPress={() => { void run(refresh); }}/>
      {preferences.data && categories.map(category => <Button key={category.key}
        title={`${category.label} reminders: ${preferences.data![category.key] ? 'on' : 'off'}`} tone="plain" disabled={disabled}
        onPress={() => { void run(async () => { await action.mutateAsync({ path: '/notification-preferences', method: 'PATCH',
          body: { [category.key]: !preferences.data![category.key] } }); }); }}/>) }
      {preferences.data && <><Text style={styles.muted}>{preferences.data.quietHoursStart && preferences.data.quietHoursEnd && preferences.data.quietHoursStart !== preferences.data.quietHoursEnd
        ? `Quiet hours: ${preferences.data.quietHoursStart}–${preferences.data.quietHoursEnd} · ${session?.user.timeZone}` : 'Quiet hours: off'}</Text>
        <Button title="Edit quiet hours" tone="plain" disabled={disabled} onPress={() => setEditingQuietHours(true)}/></>}
    </Card>
  </ScrollView>
    {editingQuietHours && preferences.data && session && <QuietHoursEditor key={session.user.id} preferences={preferences.data} timeZone={session.user.timeZone} onClose={() => setEditingQuietHours(false)}/>}
  </Screen>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 12 }, title: { fontSize: 29, fontWeight: '800', color: colors.ink }, label: { fontSize: 18, fontWeight: '800', color: colors.ink }, muted: { color: colors.muted }, error: { color: colors.coral } });
