import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/components/ui';
import { installedLabel, type LatestRelease } from './app-update';
import { appUpdatesEnabled, downloadAppUpdate, newerNativeRelease, restartToUpdate, useAppUpdateStatus } from '@/services/app-updates';

/** Settings card for self-hosted updates (ADR 021). Hidden in web and development builds. */
export function AppUpdateCard() {
  return appUpdatesEnabled() ? <UpdateControls/> : null;
}

function UpdateControls() {
  const status = useAppUpdateStatus();
  const [checking, setChecking] = useState(false); const [message, setMessage] = useState<string>();
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const check = async () => {
    setChecking(true); setMessage(undefined);
    try {
      const [native, result] = await Promise.all([newerNativeRelease().catch(() => null), downloadAppUpdate()]);
      setRelease(native);
      setMessage(result === 'downloaded' ? 'Update downloaded. Restart to start using it.'
        : native ? `Version ${native.version} needs a new install.` : 'You have the latest version.');
    } catch { setMessage('Could not reach the update server. Check your connection and try again.'); }
    finally { setChecking(false); }
  };
  const busy = checking || status.busy;
  return <View style={styles.card}>
    <View style={styles.row}><View style={styles.icon}><Ionicons name="cloud-download-outline" size={17} color="#fff"/></View>
      <View style={styles.text}><Text style={styles.title}>App updates</Text>
        <Text style={styles.muted}>{installedLabel(status.runtimeVersion, status.createdAt, status.embedded)}</Text>
        <Text style={styles.muted}>Updates download on launch and overnight, and apply the next time the app starts.</Text></View></View>
    {status.pending
      ? <Action icon="refresh" label="Restart to update" primary onPress={() => { void restartToUpdate(); }}/>
      : <Action icon="sync-outline" label={busy ? 'Checking…' : 'Check for updates'} disabled={busy} onPress={() => { void check(); }}/>}
    {release && <Action icon="download-outline" label={`Download version ${release.version}`} primary onPress={() => { void Linking.openURL(release.apkUrl); }}/>}
    {release && <Text style={styles.muted}>This version includes changes that need a fresh install. Your data stays on your account; Android asks you to confirm the install.</Text>}
    {message && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
  </View>;
}

function Action({ icon, label, primary, disabled, onPress }: { icon: 'refresh' | 'sync-outline' | 'download-outline'; label: string; primary?: boolean; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, primary && styles.primary, (pressed || disabled) && styles.dim]}>
    <Ionicons name={icon} size={17} color={primary ? colors.onAccent : colors.moss}/><Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', gap: 12 }, text: { flex: 1, gap: 2 },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue },
  title: { color: colors.ink, fontSize: 15, fontWeight: '600' }, muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  primary: { backgroundColor: colors.moss, borderColor: colors.moss }, actionText: { color: colors.moss, fontWeight: '700' }, primaryText: { color: colors.onAccent },
  message: { color: colors.ink, fontSize: 13 }, dim: { opacity: 0.6 },
});
