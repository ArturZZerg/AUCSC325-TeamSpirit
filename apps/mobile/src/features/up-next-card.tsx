import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, design, typography } from '@/components/ui';
import { MotionPressable } from '@/components/motion';
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
    {action && <MotionPressable accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`} onPress={action.go}
      style={({ hovered }) => [styles.button, hovered && styles.buttonHover]}>
      <View style={styles.buttonIcon}><Ionicons name={action.icon} size={17} color={design.signalInk}/></View>
      <Text style={styles.buttonText}>{action.label}</Text><Ionicons name="arrow-forward" size={18} color={design.signalInk}/>
    </MotionPressable>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 16, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 4 }, kicker: { ...typography, color: colors.moss, fontSize: 10, fontWeight: '600', letterSpacing: .4 },
  title: { ...typography, color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '500' }, reason: { ...typography, color: colors.muted, fontSize: 12, lineHeight: 19 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: 13, backgroundColor: design.signal,
    borderWidth: 1, borderColor: 'rgba(24,49,38,.08)' },
  buttonHover: { borderColor: colors.moss, shadowColor: design.signalInk, shadowOffset: { width: 0, height: 5 }, shadowOpacity: .1, shadowRadius: 12 },
  buttonIcon: { width: 29, height: 29, borderRadius: 9, backgroundColor: 'rgba(24,49,38,.08)', alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...typography, color: design.signalInk, fontSize: 13, fontWeight: '700', flex: 1 },
});
