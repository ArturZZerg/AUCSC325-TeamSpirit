import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { goalOccursOn, goalRecentDays, goalStreak, localDateAt, weeklyGoalProgress, type GoalDayStatus } from '@campusflow/domain';
import { State, colors } from '@/components/ui';
import { useGoalHistory } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { taskTimingLabel } from '@/features/task-form';
import { Chip } from '@/features/task-row';
import type { Goal } from '@/lib/types';

const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const statusText: Record<GoalDayStatus, string> = { done: 'completed', skipped: 'skipped', missed: 'missed', open: 'not yet recorded', rest: 'not scheduled', before: 'before this goal' };

export function scheduleLabel(goal: Goal) {
  return goal.schedule.kind === 'weeklyTarget' ? `${goal.schedule.target} times this week`
    : goal.schedule.kind === 'weekly' ? goal.schedule.weekdays.map(day => weekdayNames[day - 1]).join(', ') : 'Every day';
}

type Request = { path: string; body: unknown };
/** One routine as a habit: today's check, streak, the last seven goal-local days and secondary controls. */
export function HabitCard({ goal, disabled, pending, expanded, onToggleExpanded, onAction, onEdit, onReminder, onHistory, onDelete }: {
  goal: Goal; disabled: boolean; pending: boolean; expanded: boolean; onToggleExpanded(): void; onAction(request: Request): void;
  onEdit(): void; onReminder(): void; onHistory(): void; onDelete(): void;
}) {
  const { date } = useTodayClock(goal.timeZone);
  const history = useGoalHistory(goal.id);
  const since = localDateAt(goal.createdAt, goal.timeZone);
  const progress = history.data === undefined ? undefined : weeklyGoalProgress(goal, history.data, date);
  const streak = history.data === undefined ? undefined : goalStreak(goal, history.data, date, since);
  const days = history.data === undefined ? undefined : goalRecentDays(goal, history.data, date, since);
  const completion = history.data?.find(row => row.occurrenceKey === date);
  const onDay = goal.schedule.kind === 'weeklyTarget' || goalOccursOn({ id: goal.id, title: goal.title, schedule: goal.schedule, timeZone: goal.timeZone }, date);
  const canComplete = history.data !== undefined && !goal.pausedAt && onDay && !completion;
  const complete = (state: 'completed' | 'skipped') => onAction({ path: `/goals/${goal.id}/complete`, body: { occurrenceKey: date, state } });
  return <View style={[styles.card, goal.pausedAt && styles.paused]}>
    <View style={styles.top}>
      {canComplete ? <Pressable accessibilityRole="button" accessibilityLabel={pending ? 'Saving…' : 'Complete today'} accessibilityHint={goal.title}
        accessibilityState={{ disabled }} disabled={disabled} hitSlop={6} onPress={() => complete('completed')} style={[styles.check, disabled && !pending && styles.dim]}>
        {pending ? <ActivityIndicator color={colors.plum}/> : <Ionicons name="checkmark" size={24} color={colors.plum} style={styles.ghost}/>}
      </Pressable>
        : <View style={[styles.check, completion?.state === 'completed' ? styles.checkDone : styles.checkIdle]}>
          <Ionicons name={completion?.state === 'completed' ? 'checkmark' : completion?.state === 'skipped' ? 'play-skip-forward' : goal.pausedAt ? 'pause' : 'moon-outline'}
            size={completion?.state === 'completed' ? 24 : 18} color={completion?.state === 'completed' ? '#fff' : colors.muted}/></View>}
      <View style={styles.body}>
        <Text style={styles.title}>{goal.title}</Text>
        <Text style={styles.meta}>{goal.pausedAt ? 'Paused · ' : ''}{scheduleLabel(goal)}</Text>
        {completion && <Text style={styles.status}>{completion.state === 'completed' ? 'Completed today' : 'Skipped today'}</Text>}
        {!onDay && !goal.pausedAt && <Text style={styles.meta}>Not scheduled today</Text>}
      </View>
      {streak && <View style={[styles.streak, streak.current > 0 && styles.streakOn]} accessible
        accessibilityLabel={`Current streak ${streak.current} ${streak.unit === 'day' ? (streak.current === 1 ? 'day' : 'days') : (streak.current === 1 ? 'week' : 'weeks')}, best ${streak.best}`}>
        <Ionicons name="flame" size={16} color={streak.current > 0 ? '#D9772B' : colors.muted}/>
        <Text style={[styles.streakText, streak.current > 0 && styles.streakTextOn]}>{streak.current}{streak.unit === 'week' ? 'w' : ''}</Text>
      </View>}
    </View>
    <State loading={history.isLoading} error={history.error}/>
    {days && <View style={styles.days}>{days.map(row => <View key={row.date} style={styles.day} accessible accessibilityLabel={`${weekdayNames[row.weekday - 1]} ${row.date}: ${statusText[row.status]}`}>
      <Text style={[styles.letter, row.status === 'open' && styles.letterToday]}>{letters[row.weekday - 1]}</Text>
      <View style={[styles.dot, dotStyles[row.status]]}>{row.status === 'done' && <Ionicons name="checkmark" size={12} color="#fff"/>}</View>
    </View>)}</View>}
    {goal.schedule.kind === 'weeklyTarget' && (progress ? <View style={styles.target}>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.round(progress.completed / progress.target * 100))}%` }]}/></View>
      <Text style={styles.meta}>This week: {progress.completed} completed · Target {progress.target}</Text>
      <Text style={styles.small}>Week of {progress.weekStart} · Monday–Sunday</Text>
      {progress.reached && <Text style={styles.status}>Weekly target reached</Text>}
    </View> : <Text style={styles.meta}>Weekly progress unavailable until history is loaded.</Text>)}
    {streak && streak.best > 0 && <Text style={styles.small}>Best streak: {streak.best} {streak.unit === 'day' ? (streak.best === 1 ? 'day' : 'days') : (streak.best === 1 ? 'week' : 'weeks')} · Skips don’t break a streak</Text>}
    {goal.reminder && <Text style={styles.small}>Reminder: {taskTimingLabel(goal.reminder, goal.timeZone)}{goal.reminder.kind === 'date' ? ' · Delivery time needed' : ''}{goal.pausedAt ? ' · Inactive while paused' : ''}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Fewer' : 'More'} options for ${goal.title}`} accessibilityState={{ expanded }}
      onPress={onToggleExpanded} style={styles.more} hitSlop={6}>
      <Text style={styles.moreText}>{expanded ? 'Fewer options' : 'More options'}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.moss}/>
    </Pressable>
    {expanded && <View style={styles.actions}>
      {canComplete && <Chip icon="play-skip-forward-outline" label="Skip today" disabled={disabled} onPress={() => complete('skipped')}/>}
      <Chip icon={goal.pausedAt ? 'play-outline' : 'pause-outline'} label={goal.pausedAt ? 'Resume' : 'Pause'} disabled={disabled}
        onPress={() => onAction({ path: `/goals/${goal.id}/pause`, body: { paused: !goal.pausedAt } })}/>
      <Chip icon="create-outline" label="Edit goal" disabled={disabled} onPress={onEdit}/>
      <Chip icon="time-outline" label="Completion history" disabled={disabled} onPress={onHistory}/>
      <Chip icon="notifications-outline" label={goal.reminder ? 'Edit reminder' : 'Set reminder'} disabled={disabled} onPress={onReminder}/>
      <Chip icon="trash-outline" label="Delete" danger disabled={disabled} onPress={onDelete}/>
    </View>}
  </View>;
}

const dotStyles = StyleSheet.create({
  done: { backgroundColor: colors.plum, borderColor: colors.plum }, skipped: { backgroundColor: colors.line, borderColor: colors.line },
  missed: { backgroundColor: '#F8E6E1', borderColor: '#E9B8AA' }, open: { borderColor: colors.plum, borderStyle: 'dashed' },
  rest: { borderColor: colors.line }, before: { borderColor: 'transparent' },
});
const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line }, paused: { opacity: 0.8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 46, height: 46, borderRadius: 23, borderWidth: 2.5, borderColor: colors.plum, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: colors.plum }, checkIdle: { borderColor: colors.line, backgroundColor: colors.canvas }, ghost: { opacity: 0.25 }, dim: { opacity: 0.45 },
  body: { flex: 1, gap: 2 }, title: { color: colors.ink, fontSize: 17, fontWeight: '700' }, meta: { color: colors.muted }, small: { color: colors.muted, fontSize: 12 },
  status: { color: colors.plum, fontWeight: '700', fontSize: 13 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, minHeight: 30, borderRadius: 15, backgroundColor: colors.canvas },
  streakOn: { backgroundColor: '#FCEBD9' }, streakText: { color: colors.muted, fontWeight: '800', fontVariant: ['tabular-nums'] }, streakTextOn: { color: '#A4521A' },
  days: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }, day: { alignItems: 'center', gap: 4, minWidth: 30 },
  letter: { color: colors.muted, fontSize: 11, fontWeight: '700' }, letterToday: { color: colors.plum },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  target: { gap: 4 }, track: { height: 8, borderRadius: 4, backgroundColor: colors.canvas, overflow: 'hidden' }, fill: { height: 8, borderRadius: 4, backgroundColor: colors.plum },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 28 }, moreText: { color: colors.moss, fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
