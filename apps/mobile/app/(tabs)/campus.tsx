import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Temporal } from '@js-temporal/polyfill';
import Ionicons from '@expo/vector-icons/Ionicons';
import { localDateAt } from '@campusflow/domain';
import { Button, Screen, State, colors } from '@/components/ui';
import { Chip } from '@/features/task-row';
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
  const refresh = () => { void events.refetch(); void sources.refetch(); };
  return <Screen safeArea edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={events.isRefetching} onRefresh={refresh}/>}>
    <View style={styles.hero}><Text style={styles.eyebrow}>BEYOND THE DESK</Text><Text style={styles.title}>Campus</Text><Text style={styles.sub}>Make room for something you’ll look forward to.</Text></View>
    <View style={styles.choices}>{([['week', 'Next 7 days'], ['month', 'Next 30 days'], ['saved', 'Saved']] as const).map(([key, label]) =>
      <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: view === key }} onPress={() => setView(key)} style={[styles.choice, view === key && styles.selected]}><Text style={[styles.choiceText, view === key && styles.selectedText]}>{label}</Text></Pressable>)}</View>
    <View style={styles.search}><Ionicons name="search" size={18} color={colors.muted}/>
      <TextInput accessibilityLabel="Filter events" value={filter} onChangeText={setFilter} placeholder="Search events, places or interests" placeholderTextColor={colors.muted} style={styles.input} autoCorrect={false}/></View>
    <View style={styles.sourcePanel}>
      <Pressable accessibilityRole="button" accessibilityLabel="Calendar sources" accessibilityState={{ expanded: showSources }} onPress={() => setShowSources(value => !value)} style={styles.sourceControl}>
        <Text style={styles.sourceTitle}>Calendar sources {showSources ? '−' : '+'}</Text>
        <Text style={styles.detail}>{sources.error ? 'Couldn’t check calendar updates.' : !sourceStatus ? 'Checking calendar updates…' : !sourceStatus.length ? 'Campus calendars are not connected yet.' : sourceStatus.every(source => source.status === 'available') ? `${sourceStatus.length} campus ${sourceStatus.length === 1 ? 'calendar' : 'calendars'} · Updated hourly` : 'Some calendar listings may be out of date.'}</Text>
      </Pressable>
      {showSources && sourceStatus?.map(source => <View key={source.source} style={styles.sourceItem}>
        <Text style={styles.event}>{source.name}</Text>
        <Text style={styles.detail}>{source.status === 'available' ? 'Up to date' : source.status === 'stale' ? 'Refresh delayed · Showing last known listings' : 'No successful refresh yet'}{source.lastSuccessfulAt ? ` · Last updated ${taskTimingLabel({ kind: 'instant', at: source.lastSuccessfulAt }, timeZone)}` : ''}</Text>
        <Button title={`Visit ${source.name}`} tone="plain" onPress={() => { void open(source.website); }}/>
      </View>)}
      {showSources && <Button title="Refresh events" tone="plain" disabled={disabled || events.isFetching || sources.isFetching} onPress={refresh}/>}
      {events.isCached && events.data && <Text style={styles.detail}>Showing events saved on this device. Connect to refresh.</Text>}
    </View>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Text style={styles.result}>{view === 'saved' ? 'Your saved events' : events.data === undefined ? 'Upcoming events' : `${visibleCount} ${visibleCount === 1 ? 'event' : 'events'} to explore`}<Text style={styles.detail}> · Times in {timeZone}</Text></Text>
    <State loading={events.isLoading} error={events.error} empty={events.data !== undefined && !visibleCount ? filter ? 'No events match this filter. Try a different interest or place.' : view === 'saved' ? 'Save an event to keep it here, then add it to your daily plan.' : 'No upcoming events in this range. Try the next 30 days or check calendar updates.' : undefined}/>
    {groups.map(group => <View key={group.date} style={styles.group}><Text accessibilityRole="header" style={styles.day}>{campusDayLabel(group.date, date)}</Text>{group.events.map(event => { const source = sourceStatus?.find(row => row.source === event.source), website = campusWebsite(event.url);
      const day = event.timing.kind === 'timed' ? localDateAt(event.timing.startsAt, timeZone) : event.timing.startDate;
      const clock = (at: string) => new Date(at).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' });
      const timing = event.timing.kind === 'timed' ? `${clock(event.timing.startsAt)}${event.timing.endsAt ? ` – ${clock(event.timing.endsAt)}` : ''}` : 'All day';
      return <View key={event.id} style={[styles.card, event.saved && styles.savedCard]}>
      <View style={styles.cardTop}>
        <View style={[styles.badge, event.saved && styles.badgeSaved]}>
          <Text style={[styles.badgeMonth, event.saved && styles.badgeTextSaved]}>{new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short' }).toUpperCase()}</Text>
          <Text style={[styles.badgeDay, event.saved && styles.badgeTextSaved]}>{Number(day.slice(8))}</Text>
        </View>
        <View style={styles.cardBody}>
          {(event.category || event.saved) && <Text style={styles.eyebrow}>{[event.category, event.saved ? 'Saved' : null, event.includedInPlan ? 'In your plan' : null].filter(Boolean).join(' · ')}</Text>}
          <Text style={styles.event}>{event.title}</Text>
          <View style={styles.metaRow}><Ionicons name="time-outline" size={14} color={colors.moss}/><Text style={styles.meta}>{timing}</Text></View>
          {event.location && <View style={styles.metaRow}><Ionicons name="location-outline" size={14} color={colors.muted}/><Text style={styles.detail}>{event.location}</Text></View>}
          {source && <Text style={styles.small}>{source.name}</Text>}
        </View>
      </View>
      {event.description && <><Pressable accessibilityRole="button" accessibilityLabel={`Details: ${event.title}`} accessibilityState={{ expanded: details === event.id }} style={styles.detailsControl} onPress={() => setDetails(details === event.id ? undefined : event.id)}>
        <Text style={styles.link}>{details === event.id ? 'Hide details' : 'Read details'}</Text><Ionicons name={details === event.id ? 'chevron-up' : 'chevron-down'} size={14} color={colors.moss}/></Pressable>
        {details === event.id && <Text style={styles.detail}>{event.description}</Text>}</>}
      {event.saved === undefined && <Text style={styles.detail}>Saved status unavailable. Refresh events before changing it.</Text>}
      {event.saved && event.savedReminder === undefined && <Text style={styles.detail}>Reminder details unavailable. Refresh events before editing.</Text>}
      {event.saved && event.savedReminder && <Text style={styles.detail}>Reminder: {taskTimingLabel(event.savedReminder, timeZone)}{event.savedReminder.kind === 'date' ? ' · Delivery time needed' : ''}</Text>}
      <View style={styles.buttons}>
        <Chip icon={event.saved ? 'bookmark' : 'bookmark-outline'} label={pending === `/events/${event.id}/saved` ? 'Saving…' : event.saved ? 'Remove saved' : 'Save event'} disabled={disabled || event.saved === undefined}
          onPress={() => { void run({ path: `/events/${event.id}/saved`, method: event.saved ? 'DELETE' : 'PUT', ...(event.saved ? {} : { body: { includedInPlan: false } }) }); }}/>
        {event.saved && <><Chip icon={event.includedInPlan ? 'checkmark-circle' : 'add-circle-outline'} label={event.includedInPlan ? 'In my plan' : 'Add to plan'} disabled={disabled || event.includedInPlan === undefined}
          onPress={() => { void run({ path: `/events/${event.id}/saved`, method: 'PATCH', body: { includedInPlan: !event.includedInPlan } }); }}/>
          <Chip icon="notifications-outline" label={event.savedReminder ? 'Edit reminder' : 'Set reminder'} disabled={disabled || event.savedReminder === undefined} onPress={() => setReminding(event)}/></>}
        {(website || (details === event.id && source)) && <Chip icon="open-outline" label="Organiser website" onPress={() => { const url = website ?? source?.website; if (url) void open(url); }}/>}
      </View>
    </View>; })}</View>)}
    {visibleCount > 0 && <Text style={styles.footer}>Plans can change. Check the organiser’s calendar before you go, especially for saved events.</Text>}
  </ScrollView>
    {reminding && <EventReminderEditor key={reminding.id} event={reminding} timeZone={timeZone} onClose={() => setReminding(undefined)}/>}
  </Screen>;
}
const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' }, hero: { gap: 6, paddingTop: 6 },
  eyebrow: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }, title: { fontSize: 30, fontWeight: '800', color: colors.ink }, sub: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  choices: { flexDirection: 'row', backgroundColor: colors.sage, borderRadius: 12, padding: 3 },
  choice: { flex: 1, minHeight: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, selected: { backgroundColor: colors.card },
  choiceText: { color: colors.muted, fontWeight: '700', fontSize: 13 }, selectedText: { color: colors.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  input: { flex: 1, minHeight: 44, color: colors.ink, fontSize: 15 },
  sourcePanel: { borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 8, backgroundColor: colors.card }, sourceControl: { minHeight: 40, gap: 4 },
  sourceTitle: { color: colors.ink, fontWeight: '700' }, sourceItem: { gap: 8, paddingVertical: 8 },
  result: { color: colors.ink, fontWeight: '700' }, group: { gap: 10 }, day: { color: colors.ink, fontWeight: '800', fontSize: 19, marginTop: 4 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line }, savedCard: { borderColor: colors.coral },
  cardTop: { flexDirection: 'row', gap: 14 }, cardBody: { flex: 1, gap: 4 },
  badge: { width: 54, borderRadius: 14, backgroundColor: colors.sage, alignItems: 'center', paddingVertical: 8, alignSelf: 'flex-start' }, badgeSaved: { backgroundColor: colors.coral },
  badgeMonth: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }, badgeDay: { color: colors.ink, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }, badgeTextSaved: { color: colors.onAccent },
  event: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '800' }, metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { color: colors.moss, fontWeight: '700', lineHeight: 20 }, detail: { color: colors.muted, lineHeight: 20, flexShrink: 1 }, small: { color: colors.muted, fontSize: 12 },
  detailsControl: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, alignSelf: 'flex-start' }, link: { color: colors.moss, fontWeight: '700' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, error: { color: colors.coral }, footer: { color: colors.muted, lineHeight: 21, paddingBottom: 16 },
});
