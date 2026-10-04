import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAction, useEvents } from '@/features/queries';
import { EventReminderEditor } from '@/features/event-reminder-editor';
import { taskTimingLabel } from '@/features/task-form';
import { useSessionStore } from '@/store/session';
import type { CampusEvent } from '@/lib/types';
export default function CampusScreen() {
  const session = useSessionStore(state => state.session);
  // Session changes discard private drafts and detach pending callbacks from
  // the next account's screen, including a later login to the same account.
  return <CampusContent key={JSON.stringify([session?.user.id, session?.accessToken])} timeZone={session?.user.timeZone ?? 'UTC'}/>;
}
function CampusContent({ timeZone }: { timeZone: string }) {
  const events = useEvents(); const action = useAction(); const [filter, setFilter] = useState('');
  const guard = useRef(false); const [pending, setPending] = useState<string>(); const [message, setMessage] = useState<string>();
  const [reminding, setReminding] = useState<CampusEvent>(); const disabled = !!pending || action.isPending;
  const visible = useMemo(() => (events.data ?? []).filter(event => !filter || event.category?.toLowerCase().includes(filter.toLowerCase()) || event.title.toLowerCase().includes(filter.toLowerCase())), [events.data, filter]);
  const run = async (request: Parameters<typeof action.mutateAsync>[0]) => {
    if (guard.current) return; guard.current = true; setPending(request.path); setMessage(undefined);
    try { await action.mutateAsync(request); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the change. Please try again.'); }
    finally { guard.current = false; setPending(undefined); }
  };
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Campus</Text><Text style={styles.sub}>Find a reason to step away from your desk.</Text>
    <Field label="Filter events" value={filter} onChangeText={setFilter} placeholder="Career, wellness, club…"/>
    <Button title="Refresh events" tone="plain" disabled={disabled || events.isFetching} onPress={() => { void events.refetch(); }}/>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <State loading={events.isLoading} error={events.error} empty={events.data !== undefined && !visible.length ? 'No events match this filter. The next source refresh may bring in more.' : undefined}/>
    {visible.map(event => <Card key={event.id}>
      <Text style={styles.event}>{event.title}</Text>
      <Text style={styles.meta}>{event.timing.kind === 'timed' ? taskTimingLabel({ kind: 'instant', at: event.timing.startsAt }, timeZone) : `${event.timing.startDate} · All day`} · {event.location ?? 'Campus'}</Text>
      <Text style={styles.detail}>{event.description}</Text>
      {event.saved === undefined && <Text style={styles.detail}>Saved status unavailable. Refresh events before changing it.</Text>}
      {event.saved && event.savedReminder === undefined && <Text style={styles.detail}>Reminder details unavailable. Refresh events before editing.</Text>}
      {event.saved && event.savedReminder && <Text style={styles.detail}>Reminder: {taskTimingLabel(event.savedReminder, timeZone)}{event.savedReminder.kind === 'date' ? ' · Delivery time needed' : ''}</Text>}
      <View style={styles.buttons}>
        <Button title={pending === `/events/${event.id}/saved` ? 'Saving…' : event.saved ? 'Remove saved' : 'Save event'} tone="plain" disabled={disabled || event.saved === undefined}
          onPress={() => { void run({ path: `/events/${event.id}/saved`, method: event.saved ? 'DELETE' : 'PUT', ...(event.saved ? {} : { body: { includedInPlan: false } }) }); }}/>
        {event.saved && <><Button title={event.includedInPlan ? 'In my plan' : 'Add to plan'} disabled={disabled || event.includedInPlan === undefined}
          onPress={() => { void run({ path: `/events/${event.id}/saved`, method: 'PATCH', body: { includedInPlan: !event.includedInPlan } }); }}/>
          <Button title={event.savedReminder ? 'Edit reminder' : 'Set reminder'} tone="plain" disabled={disabled || event.savedReminder === undefined} onPress={() => setReminding(event)}/></>}
      </View>
    </Card>)}
  </ScrollView>
    {reminding && <EventReminderEditor key={reminding.id} event={reminding} timeZone={timeZone} onClose={() => setReminding(undefined)}/>}
  </Screen>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 12 }, title: { fontSize: 29, fontWeight: '800', color: colors.ink }, sub: { color: colors.muted, marginBottom: 5 }, event: { color: colors.ink, fontSize: 17, fontWeight: '800' }, meta: { color: colors.moss, fontWeight: '600' }, detail: { color: colors.muted }, buttons: { gap: 8 }, error: { color: colors.coral } });
