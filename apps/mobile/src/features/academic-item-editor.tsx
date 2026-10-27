import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addCalendarDays } from '@campusflow/domain';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from './queries';
import { useTodayClock } from './today-clock';
import { taskTimingLabel } from './task-form';
import { academicFormDefaults, academicFormRequest, academicFormSchema, type AcademicFormValues } from './academic-form';
import type { AcademicItem } from '@/lib/types';
import { courseLabel } from '@/features/course-label';
import { SheetModal } from '@/components/sheet-modal';

export function AcademicItemEditor({ item: initialItem, courses, timeZone, onClose, onSaved }: {
  item: AcademicItem | null; courses: { id: string; name: string; code: string | null; active: boolean }[];
  timeZone: string; onClose(): void; onSaved(message?: string): void;
}) {
  const { date: today } = useTodayClock(timeZone);
  // The baseline and draft belong to the same opening. A background row change
  // must not turn unchanged draft fields into edits against a newer baseline.
  const [item] = useState(initialItem);
  const action = useAction(); const busy = useRef(false);
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string>();
  const [values, setValues] = useState(() => academicFormDefaults(item, timeZone, today));
  const [remind, setRemind] = useState(true);
  const validation = academicFormSchema(item, timeZone).safeParse(values);
  const request = validation.success ? academicFormRequest(validation.data, item, timeZone) : undefined;
  const update = <K extends keyof AcademicFormValues>(key: K, value: AcademicFormValues[K]) => setValues(previous => ({ ...previous, [key]: value }));
  const close = () => { if (!busy.current) onClose(); };
  const showReminder = !item && values.kind === 'exam' && values.dueMode === 'instant';
  const save = async () => {
    if (busy.current) return;
    if (!validation.success) { setError(validation.error.issues[0].message); return; }
    if (!request) return;
    busy.current = true; setSaving(true); setError(undefined);
    // Reminders need a timed deadline. A new exam asks for one the day before by default.
    const wantsReminder = showReminder && remind;
    try {
      const created = await action.mutateAsync(request) as AcademicItem | undefined;
      if (wantsReminder && created?.id) {
        try { await action.mutateAsync({ path: `/academic-items/${created.id}/reminder`, method: 'PUT', body: { leadMinutes: 1440 } }); }
        catch {
          // The exam is saved; never repeat its creation for a missing reminder.
          onSaved('Exam added, but its reminder was not saved. Set one from the exam’s Reminder option.'); return;
        }
        onSaved('Exam added. We’ll remind you the day before.'); return;
      }
      onSaved();
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your coursework. Try again.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <SheetModal visible animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe} accessibilityViewIsModal>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}><Text style={styles.kicker}>MY COURSEWORK</Text><Button title="Cancel" tone="plain" disabled={saving} onPress={close}/></View>
        <Text style={styles.title}>{item ? 'Update your deadline.' : 'One less thing to remember.'}</Text>
        <Text style={styles.meta}>Keep track of work from a syllabus, lecture or another learning platform.</Text>
        <Field label="Coursework title" value={values.title} onChangeText={value => update('title', value)} editable={!saving} placeholder="Essay, quiz or midterm exam"/>
        <Text style={styles.section}>What kind of work?</Text>
        <View style={styles.choices}>{([{ value: 'assignment', label: 'Assignment' }, { value: 'quiz', label: 'Quiz' }, { value: 'exam', label: 'Exam' }, { value: 'discussion', label: 'Discussion' }, { value: 'planner', label: 'Other work' }] as const)
          .map(option => <Choice key={option.value} label={option.label} selected={values.kind === option.value} disabled={saving} onPress={() => update('kind', option.value)}/>)}</View>
        <Text style={styles.section}>Course (optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
          <Choice label="No course" selected={!values.courseId} disabled={saving} onPress={() => update('courseId', '')}/>
          {item?.courseId && !courses.some(course => course.id === item.courseId) && <Choice label="Saved course" selected={values.courseId === item.courseId} disabled={saving} onPress={() => update('courseId', item.courseId!)}/>}
          {courses.map(course => <Choice key={course.id} label={`${courseLabel(course)}${course.active ? '' : ' · inactive'}`} selected={values.courseId === course.id} disabled={saving} onPress={() => update('courseId', course.id)}/>)}
        </ScrollView>
        <Text style={styles.section}>When is it due?</Text>
        <View style={styles.choices}>{([{ value: 'none', label: 'No deadline' }, { value: 'date', label: 'Day only' }, { value: 'instant', label: 'Date & time' }, ...(item?.due?.kind === 'instant' ? [{ value: 'existing' as const, label: 'Keep deadline' }] : [])] as const)
          .map(option => <Choice key={option.value} label={option.label} selected={values.dueMode === option.value} disabled={saving} onPress={() => update('dueMode', option.value)}/>)}</View>
        {values.dueMode === 'existing' && <Text style={styles.meta}>{taskTimingLabel(item?.due ?? null, timeZone)}</Text>}
        {(values.dueMode === 'date' || values.dueMode === 'instant') && <>
          <View style={styles.choices}>{[{ label: 'Today', date: today }, { label: 'Tomorrow', date: addCalendarDays(today, 1) }].map(option => <Choice key={option.label} label={option.label} selected={values.dueDate === option.date} disabled={saving} onPress={() => update('dueDate', option.date)}/>)}</View>
          <Field label="Deadline date" value={values.dueDate} onChangeText={value => update('dueDate', value)} placeholder="YYYY-MM-DD" autoCorrect={false} editable={!saving}/>
          {values.dueMode === 'instant' && <Field label="Deadline time" value={values.dueTime} onChangeText={value => update('dueTime', value)} placeholder="HH:MM" autoCorrect={false} editable={!saving}/>}
          <Text style={styles.meta}>{values.dueMode === 'date' ? 'Due by the end of this day.' : 'Times follow'} {timeZone}.</Text>
        </>}
        {showReminder && <Pressable accessibilityRole="switch" accessibilityState={{ checked: remind, disabled: saving }}
          accessibilityLabel="Remind me the day before" disabled={saving} onPress={() => setRemind(value => !value)} style={styles.toggle}>
          <View style={[styles.box, remind && styles.boxOn]}>{remind && <Text style={styles.tick}>✓</Text>}</View>
          <Text style={styles.toggleText}>Remind me the day before</Text>
        </Pressable>}
        {!item && values.kind === 'exam' && values.dueMode === 'date' && <Text style={styles.meta}>Add a time to get a reminder before this exam.</Text>}
        <Text style={styles.meta}>Save first, then use Plan study time to make room for preparation. Your changes need a connection.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {request === null && <Text style={styles.meta}>No changes to save.</Text>}
        <Button title={saving ? 'Saving…' : item ? 'Save coursework' : 'Add coursework'} disabled={saving || request === null} onPress={() => { void save(); }}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></SheetModal>;
}
function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} aria-checked={selected} aria-disabled={disabled} disabled={disabled} onPress={onPress}
    style={[styles.choice, selected && styles.selected, disabled && styles.disabled]}><Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  tick: { color: colors.onAccent, fontWeight: '800', fontSize: 14 },
  toggleText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: .5 }, title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  section: { color: colors.ink, fontSize: 18, fontWeight: '700' }, meta: { color: colors.muted, lineHeight: 21 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 46, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, choiceText: { color: colors.ink, fontWeight: '600' }, selectedText: { color: colors.onAccent }, disabled: { opacity: .5 }, error: { color: colors.coral },
});
