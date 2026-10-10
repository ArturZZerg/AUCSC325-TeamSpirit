import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CreateStudyPlan } from '@campusflow/contracts';
import { ZodError } from 'zod';
import { Button, Card, Field, colors } from '@/components/ui';
import type { AcademicItem } from '@/lib/types';
import { ApiError } from '@/lib/api';
import { useAction } from './queries';
import { useTodayClock } from './today-clock';
import { taskTimingLabel } from './task-form';
import { preparationDefaults, preparationPreview, preparationRequest, preparationSaveKey, sessionsAfterDeadline, studyWeekdays,
  type PreparationConfig, type PreparationSession } from './preparation-plan';

export function PreparationPlanEditor({ item, timeZone, onClose, onSaved }: {
  item: AcademicItem; timeZone: string; onClose(): void; onSaved(): void;
}) {
  const { date: today } = useTodayClock(timeZone);
  const action = useAction();
  const [config, setConfig] = useState(() => preparationDefaults(item, today, timeZone));
  const [sessions, setSessions] = useState<PreparationSession[]>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const busy = useRef(false), attempted = useRef<CreateStudyPlan | undefined>(undefined);
  const disabled = saving || locked;
  const change = <K extends keyof PreparationConfig>(key: K, value: PreparationConfig[K]) => setConfig(previous => ({ ...previous, [key]: value }));
  const edit = (index: number, values: Partial<PreparationSession>) => setSessions(previous => previous?.map((session, position) => position === index ? { ...session, ...values } : session));
  const close = () => { if (!busy.current) onClose(); };
  const preview = () => {
    try { setSessions(preparationPreview(item, config)); setError(undefined); }
    catch (failure) { setError(failure instanceof ZodError ? failure.issues[0].message : failure instanceof Error ? failure.message : 'Check your plan dates and study days.'); }
  };
  const save = async () => {
    if (busy.current || !sessions) return;
    try {
      const body = attempted.current ?? preparationRequest(preparationSaveKey(), item, config.title, sessions, timeZone);
      attempted.current = body;
      busy.current = true; setSaving(true); setLocked(true); setError(undefined);
      await action.mutateAsync({ path: '/study-plans', method: 'POST', body });
      onSaved();
    } catch (failure) {
      // A definite boundary rejection did not create a plan. An uncertain network
      // result retains the identical key/payload until acknowledged by a retry.
      if (!busy.current || (failure instanceof ApiError && [400, 404, 409].includes(failure.status))) {
        attempted.current = undefined; setLocked(false);
      }
      setError(failure instanceof ZodError ? failure.issues[0].message : failure instanceof Error ? failure.message : 'Could not save your plan. Retry when connected.');
    } finally { busy.current = false; setSaving(false); }
  };
  const total = sessions?.reduce((sum, session) => sum + session.minutes, 0) ?? config.count * config.minutes;
  const late = sessions ? sessionsAfterDeadline(item, sessions, timeZone) : 0;
  const past = sessions?.some(session => session.date < today);
  const crowded = sessions && new Set(sessions.map(session => session.date)).size < sessions.length;
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}><Text style={styles.kicker}>COURSEWORK PREPARATION</Text><Button title="Cancel" tone="plain" disabled={saving} onPress={close}/></View>
        <Text style={styles.title}>{sessions ? 'Small steps. A clear plan.' : 'Make the deadline manageable.'}</Text>
        <Text style={styles.meta}>{item.title} · {taskTimingLabel(item.due, timeZone)}</Text>
        <View style={styles.summary}><View style={styles.stat}><Text style={styles.number}>{sessions?.length ?? config.count}</Text><Text style={styles.meta}>study sessions</Text></View>
          <View style={styles.stat}><Text style={styles.number}>{total}</Text><Text style={styles.meta}>planned minutes</Text></View></View>
        {!sessions ? <>
          <Field label="Plan name" value={config.title} onChangeText={value => change('title', value)}/>
          <Text style={styles.section}>1. Choose a starting point</Text>
          <View style={styles.choices}><Choice label="Assignment steps" selected={config.template === 'assignment'} onPress={() => change('template', 'assignment')}/>
            <Choice label="Exam revision" selected={config.template === 'revision'} onPress={() => change('template', 'revision')}/></View>
          <Text style={styles.meta}>Outline, work and review — or recall, practise and test yourself. You can rename every session.</Text>
          <Text style={styles.section}>2. Set a realistic pace</Text>
          <View style={styles.choices}>{[3, 5, 7].map(count => <Choice key={count} label={`${count} sessions`} selected={count === config.count} onPress={() => change('count', count)}/>)}</View>
          <View style={styles.choices}>{[25, 50, 90].map(minutes => <Choice key={minutes} label={`${minutes} min each`} selected={minutes === config.minutes} onPress={() => change('minutes', minutes)}/>)}</View>
          <Text style={styles.section}>3. Choose your study days</Text>
          <Field label="Start date" value={config.from} onChangeText={value => change('from', value)} placeholder="YYYY-MM-DD" autoCorrect={false}/>
          <Field label="Finish by" value={config.through} onChangeText={value => change('through', value)} placeholder="YYYY-MM-DD" autoCorrect={false}/>
          <View style={styles.choices}>{studyWeekdays.map((label, index) => <Pressable key={label} accessibilityRole="checkbox" accessibilityLabel={label}
            accessibilityState={{ checked: config.weekdays.includes(index + 1) }} aria-checked={config.weekdays.includes(index + 1)}
            onPress={() => change('weekdays', config.weekdays.includes(index + 1) ? config.weekdays.filter(day => day !== index + 1) : [...config.weekdays, index + 1])}
            style={[styles.choice, config.weekdays.includes(index + 1) && styles.selected]}><Text style={[styles.choiceText, config.weekdays.includes(index + 1) && styles.selectedText]}>{label}</Text></Pressable>)}</View>
          <Text style={styles.meta}>Spread sessions across these days. Dates are flexible; review your timetable before choosing times.</Text>
          <Button title="Preview my sessions" onPress={preview}/>
        </> : <>
          <Text style={styles.section}>Review your sessions</Text><Text style={styles.meta}>Edit each step to fit your work. Times follow {timeZone}; a blank time keeps the day flexible.</Text>
          {sessions.map((session, index) => <Card key={index}>
            <View style={styles.heading}><Text style={styles.kicker}>SESSION {index + 1}</Text><Text style={styles.meta}>{session.minutes} min</Text></View>
            <Field label={`Session ${index + 1} title`} value={session.title} onChangeText={title => edit(index, { title })} editable={!disabled}/>
            <View style={styles.row}><View style={styles.date}><Field label={`Session ${index + 1} date`} value={session.date} onChangeText={date => edit(index, { date })} placeholder="YYYY-MM-DD" editable={!disabled}/></View>
              <View style={styles.time}><Field label={`Session ${index + 1} time`} value={session.time} onChangeText={time => edit(index, { time })} placeholder="Optional HH:MM" editable={!disabled}/></View></View>
          </Card>)}
          {crowded && <Text style={styles.notice}>Some sessions share a day. Adjust dates or times to leave enough room.</Text>}
          {late > 0 && <Text style={styles.notice}>{late} {late === 1 ? 'session may' : 'sessions may'} finish after the coursework deadline. Move them earlier, or keep them for deliberate catch-up work.</Text>}
          {past && <Text style={styles.notice}>Some study dates are in the past. Review them before saving.</Text>}
          <Text style={styles.meta}>All sessions save together as your own tasks. Completing preparation tracks your work; submit coursework in your learning platform.</Text>
          {locked && !saving && <Text style={styles.notice}>The save may have reached the server. Retry the unchanged plan safely, or close and check Tasks before making another plan.</Text>}
          <Button title={saving ? 'Saving plan…' : locked ? 'Retry saving plan' : 'Save study plan'} disabled={saving} onPress={() => { void save(); }}/>
          <Button title="Back to setup" tone="plain" disabled={disabled} onPress={() => { setSessions(undefined); setError(undefined); }}/>
        </>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></Modal>;
}
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }} aria-checked={selected} onPress={onPress}
    style={[styles.choice, selected && styles.selected]}><Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 20, paddingBottom: 40, gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: .5 }, title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  section: { color: colors.ink, fontSize: 18, fontWeight: '700' }, meta: { color: colors.muted, lineHeight: 21 },
  summary: { backgroundColor: colors.sage, borderRadius: 18, padding: 16, flexDirection: 'row', gap: 12 }, stat: { flex: 1, gap: 4 }, number: { fontSize: 28, fontWeight: '800', color: colors.ink },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 46, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, choiceText: { color: colors.ink, fontWeight: '600' }, selectedText: { color: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, date: { flexGrow: 1, flexBasis: 170 }, time: { flexGrow: 1, flexBasis: 150 },
  notice: { backgroundColor: colors.sage, color: colors.ink, padding: 12, borderRadius: 12, lineHeight: 21 }, error: { color: colors.coral },
});
