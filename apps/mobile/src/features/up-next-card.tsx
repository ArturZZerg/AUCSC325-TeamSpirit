import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/components/ui';
import type { UpNext } from './up-next';

/** A single suggested next step with its reason and one direct action. */
export function UpNextCard({ next }: { next: UpNext | undefined }) {
  if (!next) return null;
  const title = next.kind === 'exam' ? next.exam.title : next.item.title;
  const focusable = next.kind === 'item' && next.item.kind === 'personalTask' && next.item.occurrenceKey === null && next.item.allowedActions.includes('complete');
  const action = focusable ? { label: 'Focus on this', icon: 'timer-outline' as const, go: () => router.push({ pathname: '/focus', params: { taskId: (next as { item: { entityId: string } }).item.entityId } }) }
    : next.kind === 'exam' || next.item.kind === 'academic' ? { label: 'Plan study', icon: 'school-outline' as const, go: () => router.push('/academics') } : undefined;
  return <View style={styles.card} accessible={false}>
    <View style={styles.row}>
      <View style={styles.icon}><Ionicons name="arrow-forward-circle" size={22} color={colors.moss}/></View>
      <View style={styles.body}>
        <Text style={styles.kicker}>UP NEXT</Text>
        <Text style={styles.title} numberOfLines={2} accessibilityLabel={`Up next: ${title}`}>{title}</Text>
        <Text style={styles.reason}>{next.reason}</Text>
      </View>
    </View>
    {action && <Pressable accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`} onPress={action.go} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons name={action.icon} size={17} color={colors.onAccent}/><Text style={styles.buttonText}>{action.label}</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.moss },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 }, kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '800' }, reason: { color: colors.muted },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: 21, backgroundColor: colors.moss },
  buttonText: { color: colors.onAccent, fontWeight: '700' }, pressed: { opacity: 0.75 },
});
