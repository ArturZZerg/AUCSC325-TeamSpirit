import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZodError } from 'zod';
import { courseColorSchema, createCourseSchema, manualCourseSource, updateCourseSchema } from '@campusflow/contracts';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { newStepId } from '@/features/task-checklist';
import type { Course } from '@/lib/types';
import { SheetModal } from '@/components/sheet-modal';

export type CourseColor = (typeof courseColorSchema.options)[number];
export const courseColors: Record<CourseColor, string> = {
  moss: colors.moss, blue: colors.blue, plum: colors.plum, coral: colors.coral,
  gold: colors.courseGold, teal: colors.courseTeal, slate: colors.courseSlate, rose: colors.courseRose,
};
export const courseColor = (course: Pick<Course, 'color'> | undefined) => course?.color ? courseColors[course.color] : colors.muted;
export const isManualCourse = (course: Pick<Course, 'source'>) => course.source === manualCourseSource;

/** Create or edit a course. Imported courses only accept a colour; manual ones are fully editable. */
export function CourseEditor({ course, onClose, onDelete }: { course: Course | null; onClose(): void; onDelete?(): void }) {
  const action = useAction();
  const saving = useRef(false);
  const manual = !course || isManualCourse(course);
  // A failed create keeps its ID so a retry cannot add the course twice.
  const [id] = useState(() => course?.id ?? newStepId());
  const [name, setName] = useState(course?.name ?? ''), [code, setCode] = useState(course?.code ?? '');
  const [color, setColor] = useState<CourseColor | null>(course?.color ?? (course ? null : 'blue'));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string>();
  const save = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setMessage(undefined);
    try {
      const request = !course ? { path: '/courses', method: 'POST', body: createCourseSchema.parse({ id, name, code, color }) }
        : { path: `/courses/${course.id}`, method: 'PATCH', body: updateCourseSchema.parse(manual ? { name, code, color } : { color }) };
      await action.mutateAsync(request); onClose();
    } catch (error) {
      setMessage(error instanceof ZodError ? error.issues[0].message : error instanceof TypeError ? 'Couldn’t confirm the save. Check your connection and retry.'
        : error instanceof Error ? error.message : 'Could not save the course. Please try again.');
    } finally { saving.current = false; setBusy(false); }
  };
  return <SheetModal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.title}>{course ? 'Edit course' : 'New course'}</Text>
        {!manual && <Text style={styles.meta}>Imported from Canvas. Its name and code follow Canvas; you can choose a colour.</Text>}
        <Field label="Course name" value={name} onChangeText={setName} placeholder="Cognitive Psychology" editable={manual && !busy}/>
        <Field label="Course code (optional)" value={code} onChangeText={setCode} placeholder="PSY 223" autoCapitalize="characters" editable={manual && !busy}/>
        <Text style={styles.label}>Colour</Text>
        <View style={styles.swatches} accessibilityRole="radiogroup">{courseColorSchema.options.map(option => <Pressable key={option} accessibilityRole="radio"
          accessibilityLabel={`${option[0].toUpperCase()}${option.slice(1)} colour`} accessibilityState={{ checked: color === option, disabled: busy }} disabled={busy}
          onPress={() => setColor(option)} style={[styles.swatch, { backgroundColor: courseColors[option] }, color === option && styles.chosen]}>
          {color === option && <Ionicons name="checkmark" size={18} color={colors.onAccent}/>}</Pressable>)}</View>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={busy ? 'Saving…' : course ? 'Save course' : 'Add course'} disabled={busy} onPress={() => { void save(); }}/>
        <Button title="Cancel" tone="plain" disabled={busy} onPress={onClose}/>
        {onDelete && <Button title="Delete course" tone="danger" disabled={busy} onPress={onDelete}/>}
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </SheetModal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' }, meta: { color: colors.muted, lineHeight: 21 }, label: { color: colors.ink, fontWeight: '700' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, chosen: { borderWidth: 3, borderColor: colors.ink },
  error: { color: colors.coral },
});
