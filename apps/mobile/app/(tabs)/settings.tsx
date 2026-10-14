import { useRef, useState, type ComponentProps, type PropsWithChildren } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, State, colors } from '@/components/ui';
import { useAction, usePreferences, useReminders } from '@/features/queries';
import { useSessionStore } from '@/store/session';
import { ensureNotificationPermission, reconcileReminders } from '@/services/reminders';
import { QuietHoursEditor } from '@/features/quiet-hours-editor';

type IconName = ComponentProps<typeof Ionicons>['name'];
const categories = [
  { key: 'academicEnabled', label: 'Academic', icon: 'school-outline', tint: colors.blue },
  { key: 'personalEnabled', label: 'Personal', icon: 'checkbox-outline', tint: colors.moss },
  { key: 'goalEnabled', label: 'Goal', icon: 'repeat-outline', tint: colors.plum },
  { key: 'eventEnabled', label: 'Event', icon: 'calendar-outline', tint: colors.coral },
] as const;

export default function SettingsScreen() {
  const router = useRouter();
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
      isCurrent: () => useSessionStore.getState().session?.accessToken === session.accessToken
        && useSessionStore.getState().session?.user.id === session.user.id
        && useSessionStore.getState().session?.user.timeZone === session.user.timeZone });
  };
  const name = session?.user.displayName.trim() ?? '';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?';
  const quiet = preferences.data?.quietHoursStart && preferences.data.quietHoursEnd && preferences.data.quietHoursStart !== preferences.data.quietHoursEnd
    ? `Quiet hours: ${preferences.data.quietHoursStart}–${preferences.data.quietHoursEnd} · ${session?.user.timeZone}` : 'Quiet hours: off';

  return <Screen safeArea edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Settings</Text>
    <View style={styles.profile}>
      <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>
      <View style={styles.profileText}>
        <Text style={styles.name} numberOfLines={1}>{name || 'Your account'}</Text>
        <Text style={styles.muted} numberOfLines={1}>{session?.user.email}</Text>
        <View style={styles.zone}><Ionicons name="globe-outline" size={13} color={colors.moss}/><Text style={styles.zoneText}>Time zone: {session?.user.timeZone}</Text></View>
      </View>
    </View>

    <Group title="Account">
      <Row icon="shield-checkmark-outline" tint={colors.moss} title="Account & privacy" detail="Export or delete your data" onPress={() => router.push('/account')}/>
      <Row icon="help-buoy-outline" tint={colors.blue} title="Help & data" label="Open Help & data" detail="Answers and how your information is used" onPress={() => router.push('/help')}/>
    </Group>

    <Group title="Notifications">
      <State loading={preferences.isLoading} error={preferences.error}/>
      <Row icon="notifications-outline" tint={colors.coral} title="Open my reminders" detail="Review reminder times and open the saved item behind each nudge." onPress={() => router.push('/reminders')}/>
      {preferences.data && categories.map(category => { const on = preferences.data![category.key];
        return <Pressable key={category.key} accessibilityRole="switch" accessibilityLabel={`${category.label} reminders`} accessibilityState={{ checked: on, disabled }}
          disabled={disabled} onPress={() => { void run(async () => { await action.mutateAsync({ path: '/notification-preferences', method: 'PATCH', body: { [category.key]: !on } }); }); }}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={[styles.icon, { backgroundColor: category.tint }]}><Ionicons name={category.icon} size={17} color="#fff"/></View>
          <Text style={styles.rowTitle}>{category.label} reminders</Text>
          <View style={[styles.track, on && styles.trackOn, disabled && styles.dim]}><View style={[styles.knob, on && styles.knobOn]}/></View>
        </Pressable>; })}
      {preferences.data && <Row icon="moon-outline" tint={colors.plum} title={quiet} action="Edit quiet hours" disabled={disabled} onPress={() => setEditingQuietHours(true)}/>}
      <Row icon="phone-portrait-outline" tint={colors.muted} title="Allow device notifications" disabled={disabled} onPress={() => { void run(async () => {
        const granted = await ensureNotificationPermission();
        if (!granted) { setMessage('Device notifications are disabled. You can enable them in your device settings.'); return; }
        await refresh();
      }); }}/>
      <Row icon="refresh-outline" tint={colors.muted} title={busy ? 'Updating…' : 'Refresh device reminders'} label="Refresh device reminders" disabled={disabled} onPress={() => { void run(refresh); }}/>
      {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    </Group>

    <Group title="Connections">
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.blue }]}><Ionicons name="link-outline" size={17} color="#fff"/></View>
        <View style={styles.rowText}><Text style={styles.rowTitle}>Canvas</Text>
          <Text style={styles.muted}>Canvas authorization will appear here after the university approves a developer key, scopes, and HTTPS callback. This build does not ask for or store a personal Canvas token.</Text></View>
        <Text style={styles.badge}>Pending</Text>
      </View>
    </Group>

    <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
      <Ionicons name="log-out-outline" size={18} color={colors.danger}/><Text style={styles.signOutText}>Sign out</Text>
    </Pressable>
    <Text style={styles.footer}>CampusFlow 0.1.0</Text>
  </ScrollView>
    {editingQuietHours && preferences.data && session && <QuietHoursEditor key={session.user.id} preferences={preferences.data} timeZone={session.user.timeZone} onClose={() => setEditingQuietHours(false)}/>}
  </Screen>;
}

function Group({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={styles.groupWrap}><Text accessibilityRole="header" style={styles.groupTitle}>{title.toUpperCase()}</Text><View style={styles.group}>{children}</View></View>;
}

function Row({ icon, tint, title, label, detail, action, disabled, onPress }: {
  icon: IconName; tint: string; title: string; label?: string; detail?: string; action?: string; disabled?: boolean; onPress(): void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={action ?? label ?? title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.dim]}>
    <View style={[styles.icon, { backgroundColor: tint }]}><Ionicons name={icon} size={17} color="#fff"/></View>
    <View style={styles.rowText}><Text style={styles.rowTitle}>{title}</Text>{detail && <Text style={styles.muted}>{detail}</Text>}</View>
    {action ? <Text style={styles.action}>{action}</Text> : <Ionicons name="chevron-forward" size={18} color={colors.muted}/>}
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontSize: 22, fontWeight: '800' }, profileText: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.sage },
  zoneText: { color: colors.moss, fontSize: 12, fontWeight: '700' },
  groupWrap: { gap: 6 }, groupTitle: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginLeft: 6 },
  group: { borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 }, rowTitle: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' },
  action: { color: colors.moss, fontWeight: '700' }, muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  badge: { color: colors.warnText, backgroundColor: colors.warnSurface, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, overflow: 'hidden' },
  track: { width: 46, height: 28, borderRadius: 14, backgroundColor: colors.line, padding: 3 }, trackOn: { backgroundColor: colors.moss },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }, knobOn: { transform: [{ translateX: 18 }] },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  signOutText: { color: colors.danger, fontWeight: '800', fontSize: 15 },
  footer: { textAlign: 'center', color: colors.muted, fontSize: 12 },
  error: { color: colors.coral, padding: 14 }, pressed: { opacity: 0.7 }, dim: { opacity: 0.5 },
});
