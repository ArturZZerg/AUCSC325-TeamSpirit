import { useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { useAction, useToday } from '@/features/queries';
import type { PlanItem } from '@/lib/types';

type PlanAction = 'complete' | 'uncomplete' | 'skip';
const today = () => new Date().toLocaleDateString('en-CA');

export default function TodayScreen() {
  const date = String(useLocalSearchParams<{ date?: string }>().date ?? today());
  const query = useToday(date);
  const action = useAction();
  const busy = useRef(false);
  const [pending, setPending] = useState<{ key: string; action: PlanAction }>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();

  const run = async (item: PlanItem, selected: PlanAction) => {
    if (busy.current || action.isPending || !item.allowedActions.includes(selected)) return;
    busy.current = true;
    setPending({ key: item.key, action: selected });
    setFailure(undefined);
    try {
      if (item.kind === 'personalTask' && selected !== 'skip') {
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
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}/> }>
    <Text style={styles.kicker}>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
    <Text style={styles.title}>Your daily flow</Text>
    {query.data?.sourceStatus.availability === 'unavailable' && <Text style={styles.offline}>Source refresh is unavailable. These are your last saved items.</Text>}
    <State loading={query.isLoading} error={query.error} empty={query.data && !query.data.items.length ? 'Nothing is planned yet. Add a task or choose a goal.' : undefined}/>
    {query.data?.items.map(item => <PlanCard key={item.key} item={item} disabled={!!pending || action.isPending}
      pendingAction={pending?.key === item.key ? pending.action : undefined}
      error={failure?.key === item.key ? failure.message : undefined}
      onAction={selected => { void run(item, selected); }}/>) }
    {query.data?.campusEvents.length ? <><Text style={styles.section}>Campus today</Text>
      {query.data.campusEvents.map(event => <Card key={event.id}><Text style={styles.item}>{event.title}</Text><Text style={styles.meta}>{event.timing.kind === 'timed' ? new Date(event.timing.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : event.timing.startDate} · {event.location ?? 'Campus'}</Text></Card>)}
    </> : null}
    {query.data?.upcoming.length ? <><Text style={styles.section}>Coming up</Text>
      {query.data.upcoming.map(item => <Card key={item.key}><Text style={styles.item}>{item.title}</Text><Text style={styles.meta}>{item.state}</Text></Card>)}
    </> : null}
  </ScrollView></Screen>;
}

function PlanCard({ item, disabled, pendingAction, error, onAction }: {
  item: PlanItem; disabled: boolean; pendingAction?: PlanAction; error?: string; onAction: (action: PlanAction) => void;
}) {
  const canComplete = (item.kind === 'personalTask' || item.kind === 'goal') && item.allowedActions.includes('complete');
  const canUndo = item.kind === 'personalTask' && item.allowedActions.includes('uncomplete');
  const canSkip = item.kind === 'goal' && item.allowedActions.includes('skip');
  return <Card>
    <View style={styles.details}>
      <Text style={styles.kind}>{item.isMainGoal ? '★ MAIN GOAL' : item.kind === 'academic' ? 'UNIVERSITY' : item.kind.toUpperCase()}</Text>
      <Text style={[styles.item, (item.state === 'completed' || item.state === 'submitted') && styles.done]}>{item.title}</Text>
      <Text style={styles.meta}>{item.state}</Text>
    </View>
    {(canComplete || canUndo || canSkip) && <View style={styles.actions}>
      {canComplete && <Button title={pendingAction === 'complete' ? 'Saving…' : 'Complete'} disabled={disabled} onPress={() => onAction('complete')}/>}
      {canUndo && <Button title={pendingAction === 'uncomplete' ? 'Saving…' : 'Undo completion'} tone="plain" disabled={disabled} onPress={() => onAction('uncomplete')}/>}
      {canSkip && <Button title={pendingAction === 'skip' ? 'Saving…' : 'Skip today'} tone="plain" disabled={disabled} onPress={() => onAction('skip')}/>}
    </View>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </Card>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 }, kicker: { color: colors.muted, fontWeight: '700' },
  title: { fontSize: 29, color: colors.ink, fontWeight: '800', marginBottom: 6 },
  section: { fontSize: 18, color: colors.ink, fontWeight: '800', marginTop: 10 },
  details: { gap: 4 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: .6 },
  item: { color: colors.ink, fontSize: 17, fontWeight: '700' }, done: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { color: colors.muted }, error: { color: colors.coral },
  offline: { backgroundColor: '#FFF3D4', color: '#725700', padding: 12, borderRadius: 12 },
});
