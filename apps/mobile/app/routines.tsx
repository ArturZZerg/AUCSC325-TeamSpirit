import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Card, Field, Screen, colors } from '@/components/ui';
import { useGoals } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { GoalEditor } from '@/features/goal-editor';
import { findExistingRoutine, routineFormDefaults, routineScheduleLabel, routineTemplates, type RoutineGroup, type RoutineTemplate } from '@/features/routine-library';
import { useSessionStore } from '@/store/session';

type IconName = ComponentProps<typeof Ionicons>['name'];
const groups: RoutineGroup[] = ['Study', 'Wellbeing', 'Everyday'];
const icons: Record<RoutineGroup, IconName> = { Study: 'book-outline', Wellbeing: 'leaf-outline', Everyday: 'sunny-outline' };

export default function RoutinesScreen() {
  const session = useSessionStore(state => state.session);
  return session ? <RoutinesContent key={JSON.stringify([session.user.id, session.accessToken])} timeZone={session.user.timeZone}/> : null;
}
function RoutinesContent({ timeZone }: { timeZone: string }) {
  const router = useRouter(); const goals = useGoals();
  const { resumeCount } = useTodayClock(timeZone); const lastResume = useRef(resumeCount);
  const [group, setGroup] = useState<RoutineGroup>(); const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<RoutineTemplate | null>();
  const [added, setAdded] = useState<string[]>([]); const [saved, setSaved] = useState(false);
  const query = search.trim().toLowerCase();
  const templates = routineTemplates.filter(template => (!group || template.group === group)
    && `${template.title} ${template.description}`.toLowerCase().includes(query));
  useEffect(() => {
    if (lastResume.current === resumeCount) return;
    lastResume.current = resumeCount;
    void goals.refetch({ cancelRefetch: false });
  }, [resumeCount, goals.refetch]);
  const choose = (template: RoutineTemplate | null) => { setSaved(false); setEditing(template); };
  const didSave = () => {
    if (editing) setAdded(previous => [...previous, editing.id]);
    setSaved(true); setEditing(undefined);
  };
  return <Screen><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
    aria-hidden={editing !== undefined} accessibilityElementsHidden={editing !== undefined} importantForAccessibility={editing !== undefined ? 'no-hide-descendants' : 'auto'}
    refreshControl={<RefreshControl refreshing={!!goals.isRefetching} onRefresh={() => { void goals.refetch(); }}/>}>
    <View style={styles.heading}><Button title="Back to Wellness" tone="plain" onPress={() => router.replace('/wellness')}/><Text style={styles.kicker}>ROUTINE LIBRARY</Text></View>
    <Text style={styles.title}>{'Small steps.\nYour rhythm.'}</Text>
    <Text style={styles.copy}>Start with an idea that fits your week. Make the title and schedule your own before adding it to your routines.</Text>
    <View style={styles.tip}><Ionicons name="sparkles-outline" size={20} color={colors.moss}/><Text style={styles.tipText}>One routine is enough to start. You can pause it whenever life gets busy.</Text></View>
    {saved && <Card><Text accessibilityRole="alert" style={styles.section}>Your routine was saved.</Text><Text style={styles.copy}>Find it in Wellness to check it off, change its schedule, or set a reminder.</Text><Button title="View my routines" onPress={() => router.push('/wellness')}/></Card>}
    {goals.error && <Text accessibilityRole="alert" style={styles.copy}>Couldn’t refresh your routines. Saved matches are shown where available.</Text>}
    {goals.data === undefined && <Card><Text style={styles.copy}>{goals.isLoading ? 'Checking your existing routines…' : 'Your existing routines haven’t loaded. Refresh before adding a starter you may already have.'}</Text>
      <Button title="Refresh my routines" tone="plain" disabled={!!goals.isFetching} onPress={() => { void goals.refetch(); }}/></Card>}
    <Field label="Search routine ideas" value={search} onChangeText={setSearch} placeholder="Study, movement, planning…" autoCorrect={false}/>
    <View style={styles.filters}>{[undefined, ...groups].map(value => <Pressable key={value ?? 'all'} accessibilityRole="radio" accessibilityLabel={value ?? 'All ideas'}
      accessibilityState={{ checked: group === value }} onPress={() => setGroup(value)} style={[styles.chip, group === value && styles.selected]}>
      <Text style={[styles.chipText, group === value && styles.selectedText]}>{value ?? 'All ideas'}</Text></Pressable>)}</View>
    <View style={styles.heading}><Text style={styles.section}>{group ?? 'Find your next small step'}</Text><Text style={styles.meta}>{templates.length} {templates.length === 1 ? 'idea' : 'ideas'}</Text></View>
    {!templates.length && <Card><Text style={styles.section}>No ideas match yet.</Text><Text style={styles.copy}>Try a different word, or create a routine that works for you.</Text><Button title="Reset filters" tone="plain" onPress={() => { setSearch(''); setGroup(undefined); }}/></Card>}
    {templates.map(template => {
      const existing = findExistingRoutine(template, goals.data); const justAdded = added.includes(template.id); const hasMatch = !!existing || justAdded;
      return <Card key={template.id}><View style={styles.cardHeading}><View style={styles.icon}><Ionicons name={icons[template.group]} size={23} color={colors.moss}/></View>
        <View style={styles.cardTitle}><Text style={styles.kicker}>{template.group.toUpperCase()}</Text><Text style={styles.section}>{template.title}</Text></View></View>
        <Text style={styles.copy}>{template.description}</Text><Text style={styles.schedule}>{existing ? `Your schedule: ${routineScheduleLabel(existing.schedule)}` : `Suggested: ${routineScheduleLabel(template.schedule)}`}</Text>
        {hasMatch && <Text style={styles.meta}>{existing ? existing.pausedAt ? 'A routine with this title is paused.' : 'You have a routine with this title.' : 'Added during this visit.'}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={`${hasMatch ? 'Manage' : 'Customize'} ${template.title}`} onPress={() => hasMatch ? router.push('/wellness') : choose(template)} style={styles.choose}>
          <Text style={styles.chooseText}>{hasMatch ? 'Manage in Wellness' : 'Customize routine'}</Text><Ionicons name="arrow-forward-outline" color={colors.moss} size={18}/></Pressable>
      </Card>;
    })}
    <Card><Text style={styles.section}>Have your own idea?</Text><Text style={styles.copy}>Create a daily routine, choose specific weekdays, or aim for a flexible weekly target.</Text><Button title="Create my own routine" tone="plain" onPress={() => choose(null)}/></Card>
    <Text style={styles.footnote}>These are optional ideas. Weekly targets can be completed on any day; reminders are set separately in Wellness.</Text>
  </ScrollView>
    {editing !== undefined && <GoalEditor key={editing?.id ?? 'custom'} goal={null} timeZone={timeZone}
      initialValues={editing ? routineFormDefaults(editing, timeZone) : undefined} onSaved={didSave} onClose={() => setEditing(undefined)}/>}
  </Screen>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 40, gap: 16 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kicker: { color: colors.moss, fontWeight: '800', letterSpacing: 1, fontSize: 11 },
  title: { fontSize: 32, fontWeight: '800', color: colors.ink, lineHeight: 39, marginTop: 10 },
  section: { fontSize: 18, fontWeight: '800', color: colors.ink, lineHeight: 24 }, copy: { color: colors.muted, fontSize: 15, lineHeight: 22 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  tip: { backgroundColor: colors.sage, borderRadius: 14, padding: 16, gap: 12, flexDirection: 'row', alignItems: 'center' }, tipText: { flex: 1, color: colors.ink, lineHeight: 21 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.ink, fontWeight: '700' }, selectedText: { color: '#fff' },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, cardTitle: { flex: 1, gap: 5 }, icon: { backgroundColor: colors.sage, width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  schedule: { color: colors.moss, fontWeight: '700', fontSize: 13, lineHeight: 20 },
  choose: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }, chooseText: { flex: 1, fontWeight: '700', color: colors.moss },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
