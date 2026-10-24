import { useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { canvasConnectionStatusSchema, canvasSyncResultSchema, canvasTokenConnectSchema, type CanvasConnectionStatus } from '@campusflow/contracts';
import { BackLink, Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { api } from '@/lib/api';
import { useSessionStore } from '@/store/session';
import { syncedLabel } from '@/features/synced-label';

// The guide follows Canvas's own wording for creating a personal access token.
const steps = [
  'Open Canvas in a browser and sign in.',
  'Select Account in the left menu, then Settings.',
  'Scroll to Approved Integrations and select + New Access Token.',
  'Enter "CampusFlow" as the purpose. Leave the expiry empty or pick a date after your term ends.',
  'Select Generate Token and copy the token. Canvas shows it only once.',
  'Paste your Canvas address and the token below, then select Connect.',
];
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

export default function CanvasScreen() {
  const session = useSessionStore(state => state.session);
  // A token typed for one account never carries over to another.
  return session ? <CanvasConnection key={session.user.id} userId={session.user.id} timeZone={session.user.timeZone}/> : null;
}

function CanvasConnection({ userId, timeZone }: { userId: string; timeZone: string }) {
  const router = useRouter(); const action = useAction(); const busy = useRef(false);
  const status = useQuery({ queryKey: ['account', userId, 'canvas-status'], queryFn: async () => canvasConnectionStatusSchema.parse(await api('/canvas/status')) });
  const [baseUrl, setBaseUrl] = useState(''); const [token, setToken] = useState('');
  const [working, setWorking] = useState<string>(); const [notice, setNotice] = useState<string>(); const [failure, setFailure] = useState<string>();

  const run = async (label: string, operation: () => Promise<string>) => {
    if (busy.current) return;
    busy.current = true; setWorking(label); setFailure(undefined); setNotice(undefined);
    try { setNotice(await operation()); }
    catch (error) { setFailure(message(error, 'Something went wrong. Check your connection and try again.')); }
    finally { busy.current = false; setWorking(undefined); void status.refetch(); }
  };
  const sync = async () => {
    const result = canvasSyncResultSchema.parse(await action.mutateAsync({ path: '/canvas/sync', method: 'POST', body: {} }));
    return `Synced ${result.coursesUpdated} ${result.coursesUpdated === 1 ? 'course' : 'courses'} and ${result.academicItemsUpdated} ${result.academicItemsUpdated === 1 ? 'assignment' : 'assignments'}.`;
  };
  const connect = () => run('Connecting…', async () => {
    const parsed = canvasTokenConnectSchema.safeParse({ baseUrl, accessToken: token });
    if (!parsed.success) throw new Error(baseUrl.trim() ? 'Paste the whole access token from Canvas.' : 'Enter your Canvas address.');
    await action.mutateAsync({ path: '/canvas/connect', method: 'POST', body: parsed.data });
    setToken('');
    try { return `Connected. ${await sync()}`; }
    catch (error) { return `Connected, but the first sync didn’t finish: ${message(error, 'try Sync now.')}`; }
  });
  const disconnect = () => run('Disconnecting…', async () => {
    await action.mutateAsync({ path: '/canvas/connection', method: 'DELETE' });
    return 'Canvas disconnected. Coursework already imported stays in CampusFlow. You can also delete the token in Canvas settings.';
  });

  const data = status.data;
  return <Screen safeArea><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.heading}><BackLink to="Settings" disabled={!!working} onPress={() => router.back()}/><Text style={styles.kicker}>CANVAS</Text></View>
    <View style={styles.hero}><Ionicons name="school-outline" size={28} color={colors.blue}/>
      <Text style={styles.title}>Bring in your Canvas coursework.</Text>
      <Text style={styles.copy}>CampusFlow imports your active courses and assignments with their due dates and submission status. Nothing is posted to Canvas.</Text></View>
    {status.isLoading && <State loading/>}
    {status.error && !data && <Card><Text accessibilityRole="alert" style={styles.warning}>Couldn’t check your Canvas connection. Check that you’re online and try again.</Text>
      <Button title="Try again" tone="plain" onPress={() => { void status.refetch(); }}/></Card>}
    {data?.connected && <Connected status={data} timeZone={timeZone} working={working} onSync={() => run('Syncing…', sync)} onDisconnect={disconnect}/>}
    {data && !data.connected && data.connectMode === 'token' && <>
      <Card>
        <Text style={styles.section}>How to get your access token</Text>
        {steps.map((step, index) => <View key={step} style={styles.step}><Text style={styles.number}>{index + 1}</Text><Text style={[styles.copy, styles.grow]}>{step}</Text></View>)}
        <Text style={styles.meta}>The token gives read access to your Canvas account like your password does. CampusFlow stores it encrypted on its server, never on this phone, and you can revoke it in Canvas at any time.</Text>
        <Button title="Canvas guide: access tokens" tone="plain" onPress={() => { void Linking.openURL('https://community.canvaslms.com/t5/Canvas-Basics-Guide/How-do-I-manage-API-access-tokens-in-my-user-account/ta-p/615312'); }}/>
      </Card>
      <Card>
        <Field label="Canvas address" value={baseUrl} onChangeText={setBaseUrl} placeholder="school.instructure.com" autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!working}/>
        <Field label="Access token" value={token} onChangeText={setToken} placeholder="Paste the token from Canvas" autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!working}/>
        <Button title={working ?? 'Connect Canvas'} disabled={!!working || !baseUrl.trim() || !token.trim()} onPress={() => { void connect(); }}/>
      </Card>
    </>}
    {data && !data.connected && data.connectMode === 'fixture' && <Card><Text style={styles.copy}>This development server uses demo Canvas data.</Text>
      <Button title={working ?? 'Load demo coursework'} disabled={!!working} onPress={() => { void run('Loading…', async () => { await action.mutateAsync({ path: '/canvas/dev/connect', method: 'POST', body: {} }); return sync(); }); }}/></Card>}
    {data && !data.connected && data.connectMode === 'unavailable' && <Card><Text style={styles.copy}>This server doesn’t have Canvas connections turned on yet. You can still add coursework yourself.</Text></Card>}
    {data?.connected && <Card>
      <Text style={styles.section}>Class times</Text>
      <Text style={styles.copy}>Canvas shares assignments, not when and where your classes meet. Import your weekly schedule from a calendar file to see classes on Today.</Text>
      <Button title="Import my class schedule" tone="plain" onPress={() => router.push('/timetable-import')}/>
    </Card>}
    {notice && <Card><Text accessibilityRole="alert" style={styles.done}>{notice}</Text></Card>}
    {failure && <Card><Text accessibilityRole="alert" style={styles.warning}>{failure}</Text></Card>}
  </ScrollView></Screen>;
}

function Connected({ status, timeZone, working, onSync, onDisconnect }: { status: CanvasConnectionStatus; timeZone: string; working?: string; onSync(): void; onDisconnect(): void }) {
  const when = status.lastSuccessfulSyncAt ? syncedLabel(status.lastSuccessfulSyncAt, timeZone) : 'not yet';
  return <Card>
    <View style={styles.step}><Ionicons name="checkmark-circle" size={22} color={colors.moss}/><Text style={[styles.item, styles.grow]}>Connected to {status.baseUrl?.replace(/^https:\/\//, '')}</Text></View>
    <Text style={styles.meta}>Last synced {when}. CampusFlow checks Canvas for changes about every 30 minutes; use Sync now for an immediate update.</Text>
    {status.lastError && <Text accessibilityRole="alert" style={styles.warning}>{status.lastError}</Text>}
    <Button title={working === 'Syncing…' ? working : 'Sync now'} disabled={!!working} onPress={onSync}/>
    <Button title={working === 'Disconnecting…' ? working : 'Disconnect Canvas'} tone="plain" disabled={!!working} onPress={onDisconnect}/>
  </Card>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hero: { paddingVertical: 10, gap: 12 }, kicker: { color: colors.blue, fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: colors.ink }, section: { fontSize: 18, fontWeight: '800', color: colors.ink },
  copy: { color: colors.muted, lineHeight: 22 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  item: { fontSize: 16, color: colors.ink, fontWeight: '700' }, warning: { color: colors.coral, lineHeight: 21 }, done: { color: colors.moss, lineHeight: 21, fontWeight: '600' },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, grow: { flex: 1 },
  number: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 24, fontWeight: '800', color: colors.onAccent, backgroundColor: colors.blue },
});
