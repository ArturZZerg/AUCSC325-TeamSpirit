import { useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { localDateAt } from '@campusflow/domain';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { useAction, useToday } from '@/features/queries';
import { taskTimingLabel } from '@/features/task-form';
import type { PlanItem } from '@/lib/types';
import { DayAgenda } from '@/features/day-agenda';
import { TaskEditor } from '@/features/task-editor';
import type { TaskFormValues } from '@/features/task-form';
import { FocusRecoveryCard } from '@/features/focus-recovery-card';

type PlanAction = 'complete' | 'uncomplete' | 'skip' | 'snooze';

export default function TodayScreen() {
  const selectedDate = useLocalSearchParams<{ date?: string }>().date;
  const query = useToday(selectedDate === undefined ? undefined : String(selectedDate));
  const date = query.date;
  const isCurrentDay = date === localDateAt(new Date(Date.now()).toISOString(), query.timeZone);
  const action = useAction();
  const busy = useRef(false);
  const [pending, setPending] = useState<{ key: string; action: PlanAction }>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const [studyDraft, setStudyDraft] = useState<Partial<TaskFormValues>>();

  const run = async (item: PlanItem, selected: PlanAction) => {
    if (busy.current || action.isPending || !item.allowedActions.includes(selected)) return;
    busy.current = true;
    setPending({ key: item.key, action: selected });
    setFailure(undefined);
    try {
      if (selected === 'snooze' && (item.kind === 'personalTask' || item.kind === 'goal')) {
        if (date !== localDateAt(new Date(Date.now()).toISOString(), query.timeZone)) throw new Error('Open today’s plan before snoozing.');
        if (item.kind === 'goal' && !item.occurrenceKey) throw new Error('Refresh your plan before changing this goal.');
        await action.mutateAsync({ path: `/${item.kind === 'goal' ? 'goals' : 'tasks'}/${item.entityId}/snooze`, body: {
          until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          ...(item.kind === 'goal' ? { occurrenceKey: item.occurrenceKey } : {}),
        } });
      } else if (item.kind === 'personalTask' && selected !== 'skip') {
        await action.mutateAsync({ path: `/tasks/${item.entityId}/complete`, body: {
          completed: selected === 'complete',
          ...(item.occurrenceKey !== null ? { occurrenceKey: item.occurrenceKey } : {}),
        } });
      } else if (item.kind === 'goal' && selected !== 'uncomplete') {
        // Goal occurrence dates belong to the goal's zone. Never substitute the
        // screen date or invent one when the read model is incomplete.
        if (!item.occurrenceKey) throw new Error('Refresh your plan before changing this goal.');
        await action.mutateAsync({ path: `/goals/${item.entityId}/complete`, body: {
          occurrenceKey: item.occurrenceKey, state: selected === 'skip' ? 'skipped' : 'completed',
        } });
      }
    } catch (error) {
      setFailure({ key: item.key, message: error instanceof Error ? error.message : 'Could not save the change. Please try again.' });
    } finally {
      busy.current = false;
      setPending(undefined);
    }
  };

  return <Screen><ScrollView contentContainerStyle={styles.content}
    aria-hidden={!!studyDraft} accessibilityElementsHidden={!!studyDraft} importantForAccessibility={studyDraft ? 'no-hide-descendants' : 'auto'}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}/> }>
    <Text style={styles.kicker}>{new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })}</Text>
    <View style={styles.heading}><Text style={styles.title}>Your daily flow</Text>
      <Button title="Get started" tone="plain" onPress={() => router.push('/get-started')}/></View>
    <View style={styles.actions}><Button title="Plan your week" tone="plain" onPress={() => router.push('/planner')}/><Button title="Review your week" tone="plain" onPress={() => router.push('/review')}/><Button title="Coursework" tone="plain" onPress={() => router.push('/academics')}/><Button title="My study plans" tone="plain" onPress={() => router.push('/study-plans')}/><Button title="Focus space" tone="plain" onPress={() => router.push('/focus')}/></View>
    {query.data?.sourceStatus.availability === 'unavailable' && <Text style={styles.offline}>Source refresh is unavailable. These are your last saved items.</Text>}
    <FocusRecoveryCard/>
    <State loading={query.isLoading} error={query.error}/>
    <DayAgenda compact date={date} timeZone={query.timeZone} onPlan={setStudyDraft}/>
    {query.data && !query.data.items.length && <Card><Text style={styles.item}>Make room for a good day.</Text>
      <Text style={styles.meta}>Add a task, keep a deadline in sight, or choose one small routine.</Text>
      <Button title="Build my daily plan" onPress={() => router.push('/get-started')}/></Card>}
    {query.data?.items.map(item => <PlanCard key={item.key} item={item} timeZone={query.timeZone} isCurrentDay={isCurrentDay} disabled={!!pending || action.isPending}
      pendingAction={pending?.key === item.key ? pending.action : undefined}
      error={failure?.key === item.key ? failure.message : undefined}
      onAction={selected => { void run(item, selected); }}/>) }
    {query.data?.campusEvents.length ? <><Text style={styles.section}>Campus today</Text>
      {query.data.campusEvents.map(event => <Card key={event.id}><Text style={styles.item}>{event.title}</Text><Text style={styles.meta}>{event.timing.kind === 'timed' ? new Date(event.timing.startsAt).toLocaleTimeString([], { timeZone: query.timeZone, hour: 'numeric', minute: '2-digit' }) : event.timing.startDate} · {event.location ?? 'Campus'}</Text></Card>)}
    </> : null}
    {query.data?.upcoming.length ? <><Text style={styles.section}>Coming up</Text>
      {query.data.upcoming.map(item => <Card key={item.key}><Text style={styles.item}>{item.title}</Text><Text style={styles.meta}>{item.state}</Text><PlanTiming item={item} timeZone={query.timeZone}/></Card>)}
    </> : null}
  </ScrollView>{studyDraft && <TaskEditor task={null} timeZone={query.timeZone} initialValues={studyDraft} onClose={() => setStudyDraft(undefined)}/>}</Screen>;
}

function PlanCard({ item, timeZone, isCurrentDay, disabled, pendingAction, error, onAction }: {
  item: PlanItem; timeZone: string; isCurrentDay: boolean; disabled: boolean; pendingAction?: PlanAction; error?: string; onAction: (action: PlanAction) => void;
}) {
  const canComplete = (item.kind === 'personalTask' || item.kind === 'goal') && item.allowedActions.includes('complete');
  const canUndo = item.kind === 'personalTask' && item.allowedActions.includes('uncomplete');
  const canSkip = item.kind === 'goal' && item.allowedActions.includes('skip');
  const canSnooze = isCurrentDay && (item.kind === 'personalTask' || item.kind === 'goal') && item.allowedActions.includes('snooze');
  return <Card>
    <View style={styles.details}>
      <Text style={styles.kind}>{item.isMainGoal ? '★ MAIN GOAL' : item.kind === 'academic' ? 'UNIVERSITY' : item.kind === 'personalTask' ? 'TASK' : item.kind.toUpperCase()}</Text>
      <Text style={[styles.item, (item.state === 'completed' || item.state === 'submitted') && styles.done]}>{item.title}</Text>
      <Text style={styles.meta}>{item.state}</Text>
      <PlanTiming item={item} timeZone={timeZone}/>
    </View>
    {(canComplete || canUndo || canSkip || canSnooze) && <View style={styles.actions}>
      {canComplete && <Button title={pendingAction === 'complete' ? 'Saving…' : 'Complete'} disabled={disabled} onPress={() => onAction('complete')}/>}
      {canComplete && item.kind === 'personalTask' && item.occurrenceKey === null && <Button title="Focus on this" tone="plain" disabled={disabled}
        onPress={() => router.push({ pathname: '/focus', params: { taskId: item.entityId } })}/>}
      {canUndo && <Button title={pendingAction === 'uncomplete' ? 'Saving…' : 'Undo completion'} tone="plain" disabled={disabled} onPress={() => onAction('uncomplete')}/>}
      {canSkip && <Button title={pendingAction === 'skip' ? 'Saving…' : 'Skip today'} tone="plain" disabled={disabled} onPress={() => onAction('skip')}/>}
      {canSnooze && <Button title={pendingAction === 'snooze' ? 'Saving…' : 'Snooze 1 hour'} tone="plain" disabled={disabled} onPress={() => onAction('snooze')}/>}
    </View>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </Card>;
}

function PlanTiming({ item, timeZone }: { item: PlanItem; timeZone: string }) {
  return <>
    {item.due && <Text style={styles.meta}>Due: {taskTimingLabel(item.due, timeZone)}</Text>}
    {item.schedule && <Text style={styles.meta}>{item.kind === 'event' ? 'Starts' : 'Scheduled'}: {taskTimingLabel(item.schedule, timeZone)}</Text>}
  </>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' }, kicker: { color: colors.muted, fontWeight: '700' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  title: { fontSize: 29, color: colors.ink, fontWeight: '800', marginBottom: 6 },
  section: { fontSize: 18, color: colors.ink, fontWeight: '800', marginTop: 10 },
  details: { gap: 4 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: .6 },
  item: { color: colors.ink, fontSize: 17, fontWeight: '700' }, done: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { color: colors.muted }, error: { color: colors.coral },
  offline: { backgroundColor: '#FFF3D4', color: '#725700', padding: 12, borderRadius: 12 },
});
