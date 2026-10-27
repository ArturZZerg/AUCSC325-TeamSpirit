import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZodError } from 'zod';
import { createAssessmentGroupSchema, updateAssessmentGroupSchema } from '@campusflow/contracts';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { newStepId } from '@/features/task-checklist';
import { percentInput } from '@/features/assessment-editor';
import type { Course } from '@/lib/types';

type Group = NonNullable<Course['assessmentGroups']>[number];
const describe = (weight: number | null) => weight === null ? 'by points' : `${Number.isInteger(weight) ? weight : weight.toFixed(1)}%`;

/**
 * Add or edit an assessment group, such as "Quizzes 20%". A blank weight grades
 * the group by points, sharing what the other weights leave. Canvas groups keep
 * their Canvas name; their weight can be changed and reset (ADR 024).
 */
export function GroupEditor({ courseId, group, inUse, onClose }: { courseId: string; group: Group | null; inUse: boolean; onClose(): void }) {
  const action = useAction();
  const saving = useRef(false);
  const [id] = useState(() => group?.id ?? newStepId());
  const [title, setTitle] = useState(group?.title ?? ''), [weight, setWeight] = useState(group?.weight == null ? '' : String(group.weight));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string>();
  const canvas = group?.canvas, path = `/courses/${courseId}/assessment-groups`;
  const run = async (request: Parameters<typeof action.mutateAsync>[0]) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setMessage(undefined);
    try { await action.mutateAsync(request); onClose(); }
    catch (error) {
      setMessage(error instanceof ZodError ? error.issues[0].message : error instanceof TypeError ? 'Couldn’t confirm the save. Check your connection and retry.'
        : error instanceof Error ? error.message : 'Could not save the group. Please try again.');
    } finally { saving.current = false; setBusy(false); }
  };
  const submit = () => {
    const parsed = percentInput(weight);
    if (parsed !== null && Number.isNaN(parsed)) { setMessage('Enter the weight as a percentage, or leave it blank to grade by points.'); return; }
    try {
      void run(canvas ? { path: `${path}/${group.id}`, method: 'PATCH', body: updateAssessmentGroupSchema.parse({ weight: parsed }) }
        : group ? { path: `${path}/${group.id}`, method: 'PATCH', body: updateAssessmentGroupSchema.parse({ title, weight: parsed }) }
          : { path, method: 'POST', body: createAssessmentGroupSchema.parse({ id, title, weight: parsed }) });
    } catch (error) { setMessage(error instanceof ZodError ? error.issues[0].message : 'Check the group details.'); }
  };
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.title}>{canvas ? group.title : group ? 'Edit group' : 'New group'}</Text>
        <Text style={styles.meta}>{canvas ? `Imported from Canvas, which weights it ${describe(canvas.weight)}. Change the weight if your outline differs.`
          : 'Group assessments that share one weight, such as Quizzes 20%. Each assessment then counts by its share of the group.'}</Text>
        {!canvas && <Field label="Group name" value={title} onChangeText={setTitle} placeholder="Quizzes" editable={!busy}/>}
        <Field label="Group weight (%)" value={weight} onChangeText={setWeight} placeholder="Blank: by points" keyboardType="decimal-pad" editable={!busy}/>
        <Text style={styles.meta}>Leave the weight blank to grade the group by points. Groups without a weight share whatever the other weights leave of 100%.</Text>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={busy ? 'Saving…' : group ? 'Save group' : 'Add group'} disabled={busy} onPress={submit}/>
        {group && canvas?.weightEdited && <Button title={`Use the Canvas weight (${describe(canvas.weight)})`} tone="plain" disabled={busy}
          onPress={() => { void run({ path: `${path}/${group.id}`, method: 'PATCH', body: { resetWeight: true } }); }}/>}
        <Button title="Cancel" tone="plain" disabled={busy} onPress={onClose}/>
        {group && !canvas && (inUse ? <Text style={styles.meta}>To delete this group, move or delete its assessments first.</Text>
          : <Button title="Delete group" tone="danger" disabled={busy} onPress={() => { void run({ path: `${path}/${group.id}`, method: 'DELETE' }); }}/>)}
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' }, meta: { color: colors.muted, lineHeight: 21 }, error: { color: colors.coral },
});
