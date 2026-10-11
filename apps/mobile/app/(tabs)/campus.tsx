import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Temporal } from '@js-temporal/polyfill';
import { Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAction, useCampusSources, useEvents } from '@/features/queries';
import { campusDayLabel, campusGroups, campusSourceAvailability, campusWebsite } from '@/features/campus-discovery';
import { useTodayClock } from '@/features/today-clock';
import { useAgendaClock } from '@/features/use-agenda-clock';
import { EventReminderEditor } from '@/features/event-reminder-editor';
import { taskTimingLabel } from '@/features/task-form';
import { useSessionStore } from '@/store/session';
import type { CampusEvent } from '@/lib/types';

export default function CampusScreen() {
  const session = useSessionStore(state => state.session);
  return <CampusContent key={JSON.stringify([session?.user.id, session?.accessToken])} timeZone={session?.user.timeZone ?? 'UTC'}/>;
}
function CampusContent({ timeZone }: { timeZone: string }) {
  const events = useEvents(); const sources = useCampusSources(); const action = useAction();
  const [filter, setFilter] = useState(''); const [view, setView] = useState<'week' | 'month' | 'saved'>('week');
  const [showSources, setShowSources] = useState(false); const [details, setDetails] = useState<string>();
  const { date, resumeCount } = useTodayClock(timeZone); const previousResume = useRef(resumeCount);
  const now = useAgendaClock(date, timeZone);
  const guard = useRef(false); const [pending, setPending] = useState<string>(); const [message, setMessage] = useState<string>();
  const [reminding, setReminding] = useState<CampusEvent>(); const disabled = !!pending || action.isPending;
  const days = view === 'month' ? 30 : 7;
  const through = Temporal.PlainDate.from(date).add({ days }).toString();
  const groups = useMemo(() => campusGroups(events.data ?? [], { date, timeZone, days, saved: view === 'saved', search: filter }), [events.data, filter, date, timeZone, days, view]);
  const visibleCount = groups.reduce((count, group) => count + group.events.length, 0);
  const sourceStatus = sources.data?.sources.map(source => ({ ...source, status: campusSourceAvailability(source, now, date, through, timeZone) }));
  useEffect(() => {
    if (previousResume.current === resumeCount) return;
    previousResume.current = resumeCount;
    void events.refetch({ cancelRefetch: false }); void sources.refetch({ cancelRefetch: false });
  }, [resumeCount, events.refetch, sources.refetch]);
  const open = async (url: string) => {
    try { await Linking.openURL(url); } catch { setMessage('Could not open the organiser website. Please try again.'); }
  };
  const run = async (request: Parameters<typeof action.mutateAsync>[0]) => {
    if (guard.current) return; guard.current = true; setPending(request.path); setMessage(undefined);
    try { await action.mutateAsync(request); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the change. Please try again.'); }
    finally { guard.current = false; setPending(undefined); }
  };
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.hero}><Text style={styles.eyebrow}>BEYOND THE DESK</Text><Text style={styles.title}>Campus</Text><Text style={styles.sub}>Make room for something you’ll look forward to.</Text></View>
    <View style={styles.choices}>{([['week', 'Next 7 days'], ['month', 'Next 30 days'], ['saved', 'Saved']] as const).map(([key, label]) =>
      <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: view === key }} onPress={() => setView(key)} style={[styles.choice, view === key && styles.selected]}><Text style={[styles.choiceText, view === key && styles.selectedText]}>{label}</Text></Pressable>)}</View>
    <Field label="Filter events" value={filter} onChangeText={setFilter} placeholder="Search events, places or interests"/>
    <View style={styles.sourcePanel}>
      <Pressable accessibilityRole="button" accessibilityLabel="Calendar sources" accessibilityState={{ expanded: showSources }} onPress={() => setShowSources(value => !value)} style={styles.sourceControl}>
        <Text style={styles.sourceTitle}>Calendar sources {showSources ? '−' : '+'}</Text>
        <Text style={styles.detail}>{sources.error ? 'Couldn’t check calendar updates.' : !sourceStatus ? 'Checking calendar updates…' : !sourceStatus.length ? 'Campus calendars are not connected yet.' : sourceStatus.every(source => source.status === 'available') ? `${sourceStatus.length} campus calendars · Updated hourly` : 'Some calendar listings may be out of date.'}</Text>
      </Pressable>
      {showSources && sourceStatus?.map(source => <View key={source.source} style={styles.sourceItem}>
        <Text style={styles.event}>{source.name}</Text>
        <Text style={styles.detail}>{source.status === 'available' ? 'Up to date' : source.status === 'stale' ? 'Refresh delayed · Showing last known listings' : 'No successful refresh yet'}{source.lastSuccessfulAt ? ` · Last updated ${taskTimingLabel({ kind: 'instant', at: source.lastSuccessfulAt }, timeZone)}` : ''}</Text>
        <Button title={`Visit ${source.name}`} tone="plain" onPress={() => { void open(source.website); }}/>
      </View>)}
      <Button title="Refresh events" tone="plain" disabled={disabled || events.isFetching || sources.isFetching} onPress={() => { void events.refetch(); void sources.refetch(); }}/>
      {events.isCached && events.data && <Text style={styles.detail}>Showing events saved on this device. Connect to refresh.</Text>}
    </View>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Text style={styles.result}>{view === 'saved' ? 'Your saved events' : events.data === undefined ? 'Upcoming events' : `${visibleCount} ${visibleCount === 1 ? 'event' : 'events'} to explore`}<Text style={styles.detail}> · Times in {timeZone}</Text></Text>
    <State loading={events.isLoading} error={events.error} empty={events.data !== undefined && !visibleCount ? filter ? 'No events match this filter. Try a different interest or place.' : view === 'saved' ? 'Save an event to keep it here, then add it to your daily plan.' : 'No upcoming events in this range. Try the next 30 days or check calendar updates.' : undefined}/>
    {groups.map(group => <View key={group.date} style={styles.group}><Text accessibilityRole="header" style={styles.day}>{campusDayLabel(group.date, date)}</Text>{group.events.map(event => <Card key={event.id}>
      {(event.category || event.saved) && <Text style={styles.eyebrow}>{[event.category, event.saved ? 'Saved' : null, event.includedInPlan ? 'In your plan' : null].filter(Boolean).join(' · ')}</Text>}
      <Text style={styles.event}>{event.title}</Text>
      <Text style={styles.meta}>{event.timing.kind === 'timed' ? taskTimingLabel({ kind: 'instant', at: event.timing.startsAt }, timeZone) : `${event.timing.startDate} · All day`} · {event.location ?? 'Campus'}</Text>
      {sourceStatus?.find(source => source.source === event.source) && <Text style={styles.detail}>{sourceStatus.find(source => source.source === event.source)?.name}</Text>}
      {event.description && <><Pressable accessibilityRole="button" accessibilityLabel={`Details: ${event.title}`} accessibilityState={{ expanded: details === event.id }} style={styles.detailsControl} onPress={() => setDetails(details === event.id ? undefined : event.id)}><Text style={styles.meta}>{details === event.id ? 'Hide details' : 'Read details'}</Text></Pressable>{details === event.id && <Text style={styles.detail}>{event.description}</Text>}</>}
      {(campusWebsite(event.url) || (details === event.id && sourceStatus?.find(source => source.source === event.source))) && <Button title="Organiser website" tone="plain" onPress={() => { const url = campusWebsite(event.url) ?? sourceStatus?.find(source => source.source === event.source)?.website; if (url) void open(url); }}/>}
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
    </Card>)}</View>)}
    {visibleCount > 0 && <Text style={styles.footer}>Plans can change. Check the organiser’s calendar before you go, especially for saved events.</Text>}
  </ScrollView>
    {reminding && <EventReminderEditor key={reminding.id} event={reminding} timeZone={timeZone} onClose={() => setReminding(undefined)}/>}
  </Screen>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }, hero: { gap: 7, paddingVertical: 10 }, eyebrow: { color: colors.moss, fontSize: 12, fontWeight: '700', letterSpacing: 1 }, title: { fontSize: 32, fontWeight: '800', color: colors.ink }, sub: { color: colors.muted, fontSize: 16, lineHeight: 23 }, choices: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, choice: { minHeight: 46, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors.line }, selected: { backgroundColor: colors.sage, borderColor: colors.moss }, choiceText: { color: colors.muted, fontWeight: '600' }, selectedText: { color: colors.ink }, sourcePanel: { borderWidth: 1, borderColor: colors.line, padding: 12, borderRadius: 16, gap: 8 }, sourceControl: { minHeight: 46, gap: 5 }, sourceTitle: { color: colors.ink, fontWeight: '700' }, sourceItem: { gap: 8, paddingVertical: 8 }, result: { color: colors.ink, fontWeight: '700' }, group: { gap: 12 }, day: { color: colors.ink, fontWeight: '800', fontSize: 20 }, event: { color: colors.ink, fontSize: 18, lineHeight: 25, fontWeight: '800' }, meta: { color: colors.moss, fontWeight: '600', lineHeight: 21 }, detail: { color: colors.muted, fontWeight: '400', lineHeight: 21 }, detailsControl: { minHeight: 46, justifyContent: 'center' }, buttons: { gap: 8 }, error: { color: colors.coral }, footer: { color: colors.muted, lineHeight: 21, paddingBottom: 16 } });
