import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, colors } from '@/components/ui';
import { focusOwner, useFocusStore } from '@/store/focus';
import { useSessionStore } from '@/store/session';

export function FocusRecoveryCard() {
  const session = useSessionStore(state => state.session);
  const focus = useFocusStore();
  if (!focus.recoveryReady || !session || focus.owner !== focusOwner(session) || focus.recoveredAt === null || focus.recorded) return null;
  const seconds = Math.floor((focus.timer.durationMs - focus.timer.remainingMs) / 1000);
  return <Card><Text style={styles.title}>Pick up where you left off</Text>
    <Text style={styles.meta}>{focus.target?.title ?? 'Free study'} · {Math.floor(seconds / 60)} min {seconds % 60} sec kept on this device</Text>
    <Text style={styles.meta}>Your unsaved block is waiting. Review it before starting new study time.</Text>
    <Button title="Recover my focus block" onPress={() => router.push('/focus')}/>
  </Card>;
}
const styles = StyleSheet.create({ title: { color: colors.ink, fontSize: 18, fontWeight: '700' }, meta: { color: colors.muted, lineHeight: 21 } });
