import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/components/ui';
import type { PersonalTask } from '@/lib/types';
import { taskTimingLabel } from './task-form';
import { planTimingLabel } from './today-plan';

type IconName = ComponentProps<typeof Ionicons>['name'];
export type TaskRowAction = 'toggle' | 'focus' | 'mainGoal' | 'edit' | 'reminder' | 'delete';

export const categoryColors: Record<PersonalTask['category'], string> = {
  university: colors.blue, personal: colors.moss, health: '#3E8C7A', fitness: '#B7792B', work: '#5B6472', social: colors.plum, other: colors.muted,
};
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);

export function recurrenceLabel(recurrence: NonNullable<PersonalTask['recurrence']>) {
  return `Every ${recurrence.interval} ${recurrence.frequency === 'daily' ? (recurrence.interval === 1 ? 'day' : 'days')
    : `${recurrence.interval === 1 ? 'week' : 'weeks'} · ${recurrence.weekdays.map(day => weekdays[day - 1]).join(', ')}`}`;
}

/** Compact checklist row; details and secondary actions appear when expanded. */
export function TaskRow({ task, today, timeZone, expanded, disabled, pending, isMainGoal, canChangeMainGoal, onToggleExpanded, onAction }: {
  task: PersonalTask; today: string; timeZone: string; expanded: boolean; disabled: boolean; pending?: TaskRowAction;
  isMainGoal: boolean; canChangeMainGoal: boolean; onToggleExpanded(): void; onAction(action: TaskRowAction): void;
}) {
  const done = !!task.completedAt, accent = categoryColors[task.category];
  const timing = planTimingLabel({ kind: 'personalTask', schedule: task.scheduled, due: task.due }, timeZone, today);
  return <View style={[styles.row, isMainGoal && styles.main]}>
    <View style={styles.top}>
      {task.recurrence ? <View style={[styles.check, styles.repeat]}><Ionicons name="repeat" size={16} color={accent}/></View>
        : <Pressable accessibilityRole="button" accessibilityLabel={pending === 'toggle' ? 'Saving…' : done ? 'Undo completion' : 'Complete'} accessibilityHint={task.title}
          accessibilityState={{ disabled, checked: done }} disabled={disabled} hitSlop={8} onPress={() => onAction('toggle')}
          style={[styles.check, { borderColor: accent }, done && { backgroundColor: accent }, disabled && pending !== 'toggle' && styles.dim]}>
          {pending === 'toggle' ? <ActivityIndicator size="small" color={done ? '#fff' : accent}/> : done ? <Ionicons name="checkmark" size={18} color="#fff"/> : null}
        </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} details for ${task.title}`} accessibilityState={{ expanded }}
        onPress={onToggleExpanded} style={styles.body}>
        {isMainGoal && <Text style={styles.star}>★ MAIN GOAL TODAY</Text>}
        <Text style={[styles.title, done && styles.done]}>{task.title}</Text>
        <View style={styles.meta}>
          <View style={[styles.dot, { backgroundColor: accent }]}/><Text style={styles.metaText}>{capitalize(task.category)}</Text>
          {task.priority === 'high' && !done && <><Ionicons name="flag" size={12} color={colors.danger}/><Text style={[styles.metaText, styles.high]}>High</Text></>}
          {timing && <Text style={styles.metaText}>· {timing}</Text>}
          {task.reminder && <Ionicons name="notifications-outline" size={13} color={colors.muted} accessibilityLabel="Has reminder"/>}
          {task.estimatedMinutes !== null && <Text style={styles.metaText}>· {task.estimatedMinutes} min</Text>}
        </View>
      </Pressable>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} style={styles.chevron}/>
    </View>
    {expanded && <View style={styles.details}>
      {task.description && <Text style={styles.description}>{task.description}</Text>}
      {task.due && <Text style={styles.detail}>Deadline: {taskTimingLabel(task.due, timeZone)}</Text>}
      {task.scheduled && <Text style={styles.detail}>Scheduled: {taskTimingLabel(task.scheduled, timeZone)}</Text>}
      {task.recurrence && <Text style={styles.detail}>{recurrenceLabel(task.recurrence)}</Text>}
      {task.estimatedMinutes !== null && <Text style={styles.detail}>Estimated duration: {task.estimatedMinutes} min</Text>}
      {task.reminder && <Text style={styles.detail}>Reminder: {taskTimingLabel(task.reminder, timeZone)}{task.reminder.kind === 'date' ? ' · Delivery time needed' : ''}</Text>}
      {task.recurrence && <Text style={styles.detail}>Complete recurring occurrences from Today.</Text>}
      <View style={styles.actions}>
        {!done && !task.recurrence && <Chip icon="timer-outline" label="Focus" disabled={disabled} onPress={() => onAction('focus')}/>}
        {(isMainGoal || canChangeMainGoal) && <Chip icon={isMainGoal ? 'star' : 'star-outline'} disabled={disabled} onPress={() => onAction('mainGoal')}
          label={pending === 'mainGoal' ? 'Saving…' : isMainGoal ? 'Remove Main Goal' : 'Make Main Goal today'}/>}
        <Chip icon="create-outline" label="Edit" disabled={disabled} onPress={() => onAction('edit')}/>
        <Chip icon="notifications-outline" label={task.reminder ? 'Edit reminder' : 'Set reminder'} disabled={disabled} onPress={() => onAction('reminder')}/>
        <Chip icon="trash-outline" label="Delete" danger disabled={disabled} onPress={() => onAction('delete')}/>
      </View>
    </View>}
  </View>;
}

export function Chip({ icon, label, disabled, danger, onPress }: { icon: IconName; label: string; disabled?: boolean; danger?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={6}
    style={({ pressed }) => [styles.chip, danger && styles.dangerChip, pressed && styles.pressed, disabled && styles.dim]}>
    <Ionicons name={icon} size={15} color={danger ? colors.danger : colors.moss}/><Text style={[styles.chipText, danger && styles.dangerText]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.card, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
  main: { borderColor: '#E3C46A', backgroundColor: '#FFFBEF' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  repeat: { borderWidth: 0, backgroundColor: colors.canvas, borderRadius: 9 },
  body: { flex: 1, gap: 4 }, chevron: { marginTop: 4 },
  star: { color: '#8A6A00', fontSize: 11, fontWeight: '800', letterSpacing: .6 },
  title: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' }, done: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 }, dot: { width: 7, height: 7, borderRadius: 4 },
  metaText: { color: colors.muted, fontSize: 13 }, high: { color: colors.danger, fontWeight: '700' },
  details: { gap: 6, paddingLeft: 40 }, description: { color: colors.ink, lineHeight: 21 }, detail: { color: colors.muted, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 11, borderRadius: 17, backgroundColor: colors.sage },
  dangerChip: { backgroundColor: '#F8E6E1' }, chipText: { color: colors.ink, fontSize: 13, fontWeight: '700' }, dangerText: { color: colors.danger },
  pressed: { opacity: .7 }, dim: { opacity: .45 },
});
