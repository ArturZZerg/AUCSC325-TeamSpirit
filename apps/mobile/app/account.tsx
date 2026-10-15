import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { accountDeletedSchema, accountExportSchema, deleteAccountSchema, type AccountExport } from '@campusflow/contracts';
import { Button, Card, Field, colors, BackLink } from '@/components/ui';
import { ApiError, api, json } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { useSessionStore } from '@/store/session';
import { shareAccountExport } from '@/services/account-export';

export default function AccountScreen() {
  const session = useSessionStore(state => state.session);
  return session ? <AccountCentre key={session.accessToken}/> : null;
}
function AccountCentre() {
  const session = useSessionStore(state => state.session)!;
  const router = useRouter(), navigation = useNavigation();
  const [copy, setCopy] = useState<AccountExport>();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<string>(), [message, setMessage] = useState<string>();
  const pending = useRef(false), attached = useRef(true);
  const isCurrent = () => attached.current && useSessionStore.getState().session?.accessToken === session.accessToken;
  useEffect(() => () => { attached.current = false; }, []);
  useEffect(() => navigation.addListener('beforeRemove', event => { if (pending.current) event.preventDefault(); }), [navigation]);
  const run = async (label: string, operation: () => Promise<void>) => {
    if (pending.current || !isCurrent()) return;
    pending.current = true; setBusy(label); setMessage(undefined);
    try { await operation(); }
    catch (error) { if (isCurrent()) setMessage(error instanceof Error ? error.message : 'The request could not be confirmed. Try again when connected.'); }
    finally { pending.current = false; if (isCurrent()) setBusy(undefined); }
  };
  const prepare = () => run('Preparing copy…', async () => {
    setCopy(undefined);
    const result = accountExportSchema.safeParse(await api('/me/export', { cache: 'no-store', headers: { Authorization: `Bearer ${session.accessToken}` } }));
    if (!result.success || result.data.profile.id !== session.user.id) throw new Error('Your complete copy could not be prepared. Please try again.');
    if (isCurrent()) setCopy(result.data);
  });
  const remove = () => run('Deleting account…', async () => {
    const input = deleteAccountSchema.safeParse({ currentPassword: password, confirmation });
    if (!input.success) throw new Error('Enter your current password and type DELETE to confirm.');
    // A lost acknowledgement does not prove deletion. Keep this form until a confirmed reply.
    await queryClient.cancelQueries({ queryKey: ['account', session.user.id] });
    if (!isCurrent()) return;
    let result;
    try { result = await api('/me', { ...json('DELETE', input.data), headers: { Authorization: `Bearer ${session.accessToken}` } }); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) throw new Error('Deletion could not be confirmed. Sign in again to check your account. An expired session does not prove deletion.');
      throw error;
    }
    if (!accountDeletedSchema.safeParse(result).success) throw new Error('The server did not confirm account deletion. Sign in again to check your account.');
    if (isCurrent()) { pending.current = false; await useSessionStore.getState().signOut({ deleted: true }); }
  });
  const counts = copy && [
    ['Tasks & completions', copy.personalTasks.length + copy.taskCompletions.length],
    ['Courses, coursework & classes', copy.courses.length + copy.academicItems.length + copy.classes.length],
    ['Preparation plans & focus records', copy.studyPlans.length + copy.focusSessions.length],
    ['Routines & history', copy.goals.length + copy.goalCompletions.length],
    ['Wellness entries', copy.wellnessEntries.length],
    ['Private & saved events', copy.privateEvents.length + copy.savedEvents.length],
    ['Reminder records', copy.reminders.length],
  ];
  return <SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <BackLink to="Settings" disabled={!!busy} onPress={() => router.replace('/settings')}/>
    <View style={styles.heading}><Text style={styles.eyebrow}>YOUR ACCOUNT</Text><Text style={styles.title}>Account & privacy</Text>
      <Text style={styles.muted}>Your student life belongs to you. Keep a copy or choose to leave CampusFlow.</Text></View>
    <Card><Text style={styles.section}>{session.user.displayName}</Text><Text style={styles.muted}>{session.user.email}</Text>
      <Text style={styles.muted}>Time zone · {session.user.timeZone}</Text>
      {Platform.OS === 'web' && <Text style={styles.muted}>For your privacy, this web session ends when you reload or close the tab.</Text>}
    </Card>
    {!confirming ? <>
      <Card><Text style={styles.section}>Keep a copy</Text><Text style={styles.muted}>Download your profile, saved work, routines, wellness and event history as a JSON file.</Text>
        <Text style={styles.muted}>Includes server-saved records and preferences. Unsaved focus drafts on your device are excluded. Connect to prepare a fresh copy.</Text>
        <Button title={busy === 'Preparing copy…' ? busy : copy ? 'Prepare a fresh copy' : 'Prepare my copy'} disabled={!!busy} onPress={() => void prepare()}/>
        {copy && <View style={styles.summary}><Text style={styles.label}>Ready to {Platform.OS === 'web' ? 'download' : 'save or share'}</Text>
          <Text style={styles.muted}>Captured {new Date(copy.capturedAt).toLocaleString()} · format v{copy.version}</Text>
          {counts?.map(([label, count]) => <View key={label} style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.count}>{count}</Text></View>)}
          <Text style={styles.muted}>Profile, notification preferences and connection metadata are included. Keep your copy private. Exported copies remain under your control after account deletion.</Text>
          <Button title={busy === 'Opening copy…' ? busy : Platform.OS === 'web' ? 'Download JSON copy' : 'Save or share JSON copy'} disabled={!!busy} onPress={() => void run('Opening copy…', async () => {
            const result = await shareAccountExport(copy, isCurrent); if (isCurrent()) setMessage(result);
          })}/>
        </View>}
      </Card>
      <Card><Text style={styles.section}>Leave CampusFlow</Text><Text style={styles.muted}>Permanently remove your account and all saved personal information. You can review what happens before confirming.</Text>
        <Button title="Review account deletion" tone="plain" disabled={!!busy} onPress={() => { setMessage(undefined); setConfirming(true); }}/></Card>
    </> : <Card><Text style={styles.section}>Delete your account permanently?</Text>
      <Text style={styles.muted}>This removes your profile, tasks, coursework, classes, study plans, focus history, routines, wellness, private events, saved events and reminders. All account sessions lose server access.</Text>
      <Text style={styles.muted}>This cannot be undone. Download a copy first if you need your history. Other offline devices clear their local data when they next contact the server. Copies you exported remain yours.</Text>
      <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy}/>
      <Field label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} editable={!busy}/>
      <Button title={busy === 'Deleting account…' ? busy : 'Permanently delete my account'} tone="danger" disabled={!!busy} onPress={() => void remove()}/>
      <Button title="Keep my account" tone="plain" disabled={!!busy} onPress={() => { setConfirming(false); setPassword(''); setConfirmation(''); setMessage(undefined); }}/>
    </Card>}
    {message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, page: { padding: 20, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' },
  heading: { gap: 8, paddingVertical: 8 }, eyebrow: { color: colors.moss, fontWeight: '800', letterSpacing: 1.4, fontSize: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' },
  section: { color: colors.ink, fontSize: 20, fontWeight: '800' }, label: { color: colors.ink, fontWeight: '700' }, muted: { color: colors.muted, lineHeight: 21 },
  summary: { gap: 10, borderTopWidth: 1, borderColor: colors.line, paddingTop: 14 }, row: { flexDirection: 'row', gap: 12, alignItems: 'center' }, rowLabel: { flex: 1, color: colors.ink },
  count: { color: colors.moss, fontWeight: '800' }, message: { color: colors.ink, lineHeight: 21, padding: 12, backgroundColor: colors.sage, borderRadius: 12 },
});
