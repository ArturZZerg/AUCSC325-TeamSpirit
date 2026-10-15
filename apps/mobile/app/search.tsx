import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BackLink, Screen, colors } from '@/components/ui';
import { useAcademic, useCourses, useEvents, useGoals, useTasks } from '@/features/queries';
import { searchEverything, type SearchKind, type SearchResult } from '@/features/global-search';
import { TaskEditor } from '@/features/task-editor';
import { useSessionStore } from '@/store/session';
import type { PersonalTask } from '@/lib/types';

type IconName = ComponentProps<typeof Ionicons>['name'];
const kinds: Record<SearchKind, { icon: IconName; color: string; label: string }> = {
  task: { icon: 'checkbox-outline', color: colors.moss, label: 'Task' }, coursework: { icon: 'school-outline', color: colors.blue, label: 'Coursework' },
  course: { icon: 'color-palette-outline', color: colors.plum, label: 'Course' }, routine: { icon: 'repeat-outline', color: colors.plum, label: 'Routine' },
  event: { icon: 'calendar-outline', color: colors.coral, label: 'Event' },
};

export default function SearchScreen() {
  const session = useSessionStore(state => state.session);
  // Account switches discard the private query.
  return session ? <SearchContent key={JSON.stringify([session.user.id, session.accessToken])} timeZone={session.user.timeZone}/> : null;
}

function SearchContent({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  const tasks = useTasks(), academic = useAcademic(), courses = useCourses(), goals = useGoals(), events = useEvents();
  const [query, setQuery] = useState(''), [editing, setEditing] = useState<PersonalTask>();
  const { results, missing } = useMemo(() => searchEverything(query, { tasks: tasks.data, academic: academic.data, courses: courses.data, goals: goals.data, events: events.data }),
    [query, tasks.data, academic.data, courses.data, goals.data, events.data]);
  const open = (result: SearchResult) => {
    if (result.kind === 'task') { const task = tasks.data?.find(row => row.id === result.id); if (task) setEditing(task); }
    else if (result.kind === 'coursework') router.push('/academics');
    else if (result.kind === 'course') router.push({ pathname: '/course/[id]', params: { id: result.id } });
    else if (result.kind === 'routine') router.push('/wellness');
    else router.push('/campus');
  };
  return <Screen safeArea><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
    aria-hidden={!!editing} accessibilityElementsHidden={!!editing} importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}>
    <BackLink to="Today" onPress={() => router.back()}/>
    <View style={styles.search}><Ionicons name="search" size={20} color={colors.muted}/>
      <TextInput accessibilityLabel="Search CampusFlow" value={query} onChangeText={setQuery} autoFocus placeholder="Tasks, steps, coursework, courses, events" placeholderTextColor={colors.muted}
        style={styles.input} autoCorrect={false} returnKeyType="search" maxLength={120}/>
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}><Ionicons name="close-circle" size={20} color={colors.muted}/></Pressable>}
    </View>
    {!query.trim() && <View style={styles.empty}><Ionicons name="sparkles-outline" size={26} color={colors.moss}/>
      <Text style={styles.title}>Find anything in your plan.</Text>
      <Text style={styles.meta}>Search searches what’s saved on this device: tasks and their steps, coursework, courses, routines and campus events.</Text></View>}
    {!!query.trim() && <Text style={styles.meta} accessibilityLiveRegion="polite">{results.length ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : 'No matches. Try fewer or different words.'}</Text>}
    {!!query.trim() && missing.length > 0 && <Text style={styles.notice}>Some lists haven’t loaded yet, so results may be incomplete.</Text>}
    {results.map(result => { const kind = kinds[result.kind];
      return <Pressable key={result.key} accessibilityRole="button" accessibilityLabel={`${kind.label}: ${result.title}. ${result.detail}`} onPress={() => open(result)}
        style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
        <View style={[styles.icon, { backgroundColor: `${kind.color}22` }]}><Ionicons name={kind.icon} size={18} color={kind.color}/></View>
        <View style={styles.body}><Text style={[styles.name, result.done && styles.done]} numberOfLines={2}>{result.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{kind.label}{result.detail && result.detail !== kind.label ? ` · ${result.detail.replace(/^Routine · /, '')}` : ''}</Text></View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted}/>
      </Pressable>; })}
  </ScrollView>{editing && <TaskEditor key={editing.id} task={editing} timeZone={timeZone} onClose={() => setEditing(undefined)}/>}</Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 16, paddingHorizontal: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  input: { flex: 1, minHeight: 50, color: colors.ink, fontSize: 16 },
  empty: { alignItems: 'center', gap: 6, padding: 24 }, title: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  meta: { color: colors.muted, lineHeight: 19, textAlign: 'left' }, notice: { backgroundColor: colors.warnSurface, color: colors.warnText, padding: 10, borderRadius: 12 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.75 }, icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 }, name: { color: colors.ink, fontSize: 15, fontWeight: '700' }, done: { color: colors.muted, textDecorationLine: 'line-through' },
});
