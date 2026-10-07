import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addCalendarDays } from '@campusflow/domain';
import { Button, Card, Field, colors } from '@/components/ui';
import { useAction } from './queries';
import { useTodayClock } from './today-clock';
import { calendarLabel } from './weekly-planner';
import { taskTimingLabel } from './task-form';
import { studyAfterDeadline, studyPlanRequest, studyPlanSchema, studySteps, studyTaskTitle, type StudyPlanValues } from './study-plan';
import type { AcademicItem } from '@/lib/types';

export function StudyPlanEditor({ item, course, timeZone, onClose, onSaved }: {
  item: AcademicItem; course?: string; timeZone: string; onClose(): void; onSaved(): void;
}) {
  const { date: today } = useTodayClock(timeZone);
  const action = useAction();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [step, setStep] = useState<typeof studySteps[number]['id']>('work');
  const [values, setValues] = useState<StudyPlanValues>({ title: studyTaskTitle(item, studySteps[1]), notes: studySteps[1].detail, date: today, time: '', minutes: '25' });
  const update = <K extends keyof StudyPlanValues>(key: K, value: StudyPlanValues[K]) => setValues(previous => ({ ...previous, [key]: value }));
  const close = () => { if (!busy.current) onClose(); };
  const save = async () => {
    if (busy.current) return;
    const result = studyPlanSchema(timeZone).safeParse(values);
    if (!result.success) { setError(result.error.issues[0].message); return; }
    busy.current = true; setSaving(true); setError(undefined);
    try { await action.mutateAsync(studyPlanRequest(item, course, result.data, timeZone)); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your study task. Try again.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}><Text style={styles.kicker}>MAKE ROOM TO STUDY</Text><Button title="Cancel" tone="plain" disabled={saving} onPress={close}/></View>
        <Text style={styles.title}>A small step forward.</Text>
        <Card><Text style={styles.kicker}>{course ?? 'COURSEWORK'}</Text><Text style={styles.item}>{item.title}</Text><Text style={styles.meta}>Coursework deadline: {taskTimingLabel(item.due, timeZone)}</Text></Card>
        <Text style={styles.section}>1. Choose your next step</Text>
        <View style={styles.choices}>{studySteps.map(option => <Choice key={option.id} label={option.label} selected={step === option.id} disabled={saving} onPress={() => {
          const previous = studySteps.find(value => value.id === step)!;
          setStep(option.id);
          setValues(value => ({ ...value, title: value.title === studyTaskTitle(item, previous) ? studyTaskTitle(item, option) : value.title,
            notes: value.notes === previous.detail ? option.detail : value.notes }));
        }}/>)}</View>
        <Field label="Study task" value={values.title} onChangeText={value => update('title', value)} editable={!saving}/>
        <Field label="What will you work on?" value={values.notes} onChangeText={value => update('notes', value)} editable={!saving} multiline/>
        <Text style={styles.section}>2. Reserve some time</Text>
        <View style={styles.choices}>{(['25', '50', '90'] as const).map(minutes => <Choice key={minutes} label={`${minutes} min`} selected={values.minutes === minutes} disabled={saving} onPress={() => update('minutes', minutes)}/>)}</View>
        <Text style={styles.meta}>One focused block is enough to make progress.</Text>
        <Text style={styles.section}>3. Pick a day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
          {Array.from({ length: 7 }, (_, offset) => {
            const date = addCalendarDays(today, offset);
            const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : calendarLabel(date, { weekday: 'short', day: 'numeric' });
            return <Choice key={date} label={label} selected={values.date === date} disabled={saving} onPress={() => update('date', date)}/>;
          })}
        </ScrollView>
        <Field label="Study date" value={values.date} onChangeText={value => update('date', value)} placeholder="YYYY-MM-DD" autoCorrect={false} editable={!saving}/>
        <Field label="Start time (optional)" value={values.time} onChangeText={value => update('time', value)} placeholder="HH:MM" autoCorrect={false} editable={!saving}/>
        <Text style={styles.meta}>Times follow {timeZone}. Leave the time blank to keep the day flexible.</Text>
        {studyAfterDeadline(item, values.date, timeZone) && <Text style={styles.notice}>This day is after the coursework deadline. Choose an earlier day if you need to finish before it is due.</Text>}
        <Text style={styles.meta}>Saved as your own task in Tasks and your plan. Completing it tracks your preparation; submit coursework in Canvas.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button title={saving ? 'Saving…' : 'Add to my plan'} disabled={saving} onPress={() => { void save(); }}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></Modal>;
}
function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.choice, selected && styles.selected, disabled && styles.disabled]}><Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: .5 }, title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  item: { color: colors.ink, fontSize: 17, fontWeight: '700' }, section: { color: colors.ink, fontSize: 18, fontWeight: '700' }, meta: { color: colors.muted, lineHeight: 21 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 46, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, choiceText: { color: colors.ink, fontWeight: '600' }, selectedText: { color: '#fff' }, disabled: { opacity: .5 },
  notice: { backgroundColor: colors.sage, color: colors.ink, padding: 12, borderRadius: 12, lineHeight: 21 }, error: { color: colors.coral },
});
