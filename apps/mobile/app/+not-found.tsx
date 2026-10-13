import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Screen, colors } from '@/components/ui';
import { useSessionStore } from '@/store/session';

// Recovery never displays or follows the incoming path/query.
export default function UnavailablePage() {
  const router = useRouter(), { session, ready } = useSessionStore();
  return <Screen safeArea><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.copy}>
      <Text style={styles.brand}>CAMPUSFLOW</Text>
      <Text accessibilityRole="header" style={styles.title}>This page isn’t available.</Text>
      <Text style={styles.body}>The link may be outdated or incomplete. Return to CampusFlow or find an answer in Help & data.</Text>
      {!ready && <Text style={styles.body}>Opening your app…</Text>}
    </View>
    <View style={styles.actions}>
      <Button title={session ? 'Back to Today' : 'Back to sign in'} disabled={!ready}
        onPress={() => router.replace(session ? '/today' : '/auth')}/>
      <Button title="Open Help & data" tone="plain" disabled={!ready} onPress={() => router.replace('/help')}/>
    </View>
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ page: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  copy: { gap: 14 }, brand: { color: colors.moss, fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '800', lineHeight: 38 },
  body: { color: colors.muted, fontSize: 17, lineHeight: 26 }, actions: { gap: 12 } });
