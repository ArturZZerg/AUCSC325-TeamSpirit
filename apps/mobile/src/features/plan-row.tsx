import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, design, typography } from '@/components/ui';
import { MotionPressable } from '@/components/motion';
import type { PlanItem } from '@/lib/types';
import { isPlanItemDone, kindLabels, planStateLabel, planTimingLabel } from './today-plan';

export type PlanAction = 'complete' | 'uncomplete' | 'skip' | 'snooze' | 'focus';
type IconName = ComponentProps<typeof Ionicons>['name'];

export const kindColors: Record<PlanItem['kind'], string> = { academic: colors.blue, personalTask: colors.moss, goal: colors.plum, event: colors.coral };
const kindIcons: Record<PlanItem['kind'], IconName> = { academic: 'school-outline', personalTask: 'checkbox-outline', goal: 'repeat-outline', event: 'calendar-outline' };

/** One checklist row. The screen owns the mutations; the row only reports intent. */
/** Optional context joined from cached lists; absent data simply hides the extra detail. */
export type PlanRowContext = { course?: { label: string; color: string }; steps?: { done: number; total: number } };

export function PlanRow({ item, timeZone, date, isCurrentDay, disabled, pendingAction, error, onAction, context, children }: {
  item: PlanItem; timeZone: string; date: string; isCurrentDay: boolean; disabled: boolean;
  pendingAction?: PlanAction; error?: string; onAction: (action: PlanAction) => void; context?: PlanRowContext; children?: ReactNode;
}) {
  const work = item.kind === 'personalTask' || item.kind === 'goal';
  const canComplete = work && item.allowedActions.includes('complete');
  const canUndo = item.kind === 'personalTask' && item.allowedActions.includes('uncomplete');
  const canSkip = item.kind === 'goal' && item.allowedActions.includes('skip');
  const canSnooze = isCurrentDay && work && item.allowedActions.includes('snooze');
  const canFocus = canComplete && item.kind === 'personalTask' && item.occurrenceKey === null;
  const done = isPlanItemDone(item), muted = done || item.state === 'skipped';
  const accent = kindColors[item.kind], state = planStateLabel(item), timing = planTimingLabel(item, timeZone, date);
  const checkPending = pendingAction === 'complete' || pendingAction === 'uncomplete';
  return <View style={[styles.row, item.isMainGoal && !muted && styles.main]}>
    <View style={styles.top}>
      {canComplete || canUndo
        ? <MotionPressable lift={0} accessibilityRole="button" accessibilityLabel={checkPending ? 'Saving…' : canUndo ? 'Undo completion' : 'Complete'}
          accessibilityHint={item.title} accessibilityState={{ disabled, checked: done }} disabled={disabled} hitSlop={8}
          onPress={() => onAction(canUndo ? 'uncomplete' : 'complete')}
          style={({ hovered }) => [styles.check, { borderColor: accent }, hovered && !done && { backgroundColor: `${accent}14` }, done && styles.checkDone, disabled && !checkPending && styles.dim]}>
          {checkPending ? <ActivityIndicator size="small" color={done ? design.signalInk : accent}/> : done ? <Ionicons name="checkmark" size={18} color={design.signalInk}/> : null}
        </MotionPressable>
        : <View style={[styles.check, styles.badge, { backgroundColor: done ? accent : `${accent}1A`, borderColor: 'transparent' }]}>
          <Ionicons name={done ? 'checkmark' : kindIcons[item.kind]} size={16} color={done ? colors.onAccent : accent}/></View>}
      <View style={styles.body}>
        <View style={styles.labels}>
          {item.isMainGoal && <Text style={styles.star}>★ MAIN GOAL</Text>}
          <View style={[styles.dot, { backgroundColor: context?.course?.color ?? accent }]}/>
          <Text style={[styles.kind, { color: context?.course?.color ?? accent }]}>{(context?.course?.label ?? kindLabels[item.kind]).toUpperCase()}</Text>
          {state && <Text style={[styles.chip, item.state === 'overdue' && styles.overdue]}>{state}</Text>}
          {item.priority === 'high' && !muted && <Text style={[styles.chip, styles.high]}>High priority</Text>}
        </View>
        <Text style={[styles.title, muted && styles.done]}>{item.title}</Text>
        {timing && <Text style={[styles.meta, item.state === 'overdue' && styles.overdueText]}>{timing}</Text>}
        {!!context?.steps?.total && <Text style={styles.meta} accessibilityLabel={`${context.steps.done} of ${context.steps.total} steps done`}>{context.steps.done}/{context.steps.total} steps</Text>}
      </View>
    </View>
    {children}
    {(canFocus || canSkip || canSnooze) && <View style={styles.actions}>
      {canFocus && <Chip icon="timer-outline" label="Focus on this" disabled={disabled} onPress={() => onAction('focus')}/>}
      {canSkip && <Chip icon="play-skip-forward-outline" label={pendingAction === 'skip' ? 'Saving…' : 'Skip today'} disabled={disabled} onPress={() => onAction('skip')}/>}
      {canSnooze && <Chip icon="alarm-outline" label={pendingAction === 'snooze' ? 'Saving…' : 'Snooze 1 hour'} disabled={disabled} onPress={() => onAction('snooze')}/>}
    </View>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

function Chip({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress: () => void }) {
  return <MotionPressable lift={0} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={6}
    style={({ hovered }) => [styles.action, hovered && styles.actionHover, disabled && styles.dim]}>
    <Ionicons name={icon} size={15} color={colors.moss}/><Text style={styles.actionText}>{label}</Text>
  </MotionPressable>;
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 3, borderBottomWidth: 1, borderColor: colors.line },
  main: { borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.goldSurface },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  check: { width: 30, height: 30, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkDone: { backgroundColor: design.signal, borderColor: design.signalInk },
  badge: { borderRadius: 10 }, dim: { opacity: .45 },
  body: { flex: 1, gap: 4 }, labels: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 }, kind: { ...typography, fontSize: 9, fontWeight: '600', letterSpacing: .8 },
  star: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: .6 },
  chip: { fontSize: 11, fontWeight: '700', color: colors.muted, backgroundColor: colors.canvas, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  overdue: { color: colors.onAccent, backgroundColor: colors.coral }, high: { color: colors.danger, backgroundColor: colors.dangerSurface },
  title: { ...typography, color: colors.ink, fontSize: 14, lineHeight: 22, fontWeight: '500' }, done: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { ...typography, color: colors.muted, fontSize: 11, lineHeight: 18 }, overdueText: { color: colors.coral, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 42 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 46, paddingHorizontal: 7, borderRadius: 8 },
  actionHover: { backgroundColor: colors.sage },
  actionText: { ...typography, color: colors.muted, fontSize: 11, fontWeight: '500' }, error: { color: colors.coral, paddingLeft: 42 },
});
