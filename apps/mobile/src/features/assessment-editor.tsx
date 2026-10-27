import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZodError } from 'zod';
import { createAssessmentSchema, updateAssessmentSchema } from '@campusflow/contracts';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { newStepId } from '@/features/task-checklist';
import type { Course } from '@/lib/types';

type Assessment = NonNullable<Course['assessments']>[number];
type Group = NonNullable<Course['assessmentGroups']>[number];
/** Reads "85", "85%" or "85,5" as a number; blank is null and anything else NaN. */
export const percentInput = (value: string) => value.trim() === '' ? null : Number(value.trim().replace(',', '.').replace(/%$/, ''));
const amount = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * Add or edit one weighted assessment. Without a group the weight is a percent of
 * the course; in a group it is the assessment's share of the group (points work).
 * Canvas assessments follow Canvas except for their weight (ADR 024).
 */
export function AssessmentEditor({ courseId, assessment, groups = [], initialGroupId = null, onClose }:
  { courseId: string; assessment: Assessment | null; groups?: readonly Group[]; initialGroupId?: string | null; onClose(): void }) {
  const action = useAction();
  const saving = useRef(false);
  const [id] = useState(() => assessment?.id ?? newStepId());
  const [title, setTitle] = useState(assessment?.title ?? ''), [weight, setWeight] = useState(assessment ? String(assessment.weight) : '');
  const [score, setScore] = useState(assessment?.score === null || !assessment ? '' : String(assessment.score));
  const [groupId, setGroupId] = useState<string | null>(assessment ? assessment.groupId ?? null : initialGroupId);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string>();
  const canvas = assessment?.canvas, path = `/courses/${courseId}/assessments`;
  const run = async (request: Parameters<typeof action.mutateAsync>[0]) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setMessage(undefined);
    try { await action.mutateAsync(request); onClose(); }
    catch (error) {
      setMessage(error instanceof ZodError ? error.issues[0].message : error instanceof TypeError ? 'Couldn’t confirm the save. Check your connection and retry.'
        : error instanceof Error ? error.message : 'Could not save the assessment. Please try again.');
    } finally { saving.current = false; setBusy(false); }
  };
  const submit = () => {
    const parsedWeight = percentInput(weight), parsedScore = percentInput(score);
    if (parsedWeight === null || Number.isNaN(parsedWeight)) { setMessage(groupId ? 'Enter its share of the group, such as its points.' : 'Enter the weight as a percentage, such as 30.'); return; }
    if (parsedScore !== null && Number.isNaN(parsedScore)) { setMessage('Enter the score as a percentage, or leave it blank.'); return; }
    // Only send a group when the course has groups, so plain outlines keep their simple requests.
    const grouping = groups.length ? { groupId } : {};
    try {
      void run(canvas ? { path: `${path}/${assessment.id}`, method: 'PATCH', body: updateAssessmentSchema.parse({ weight: parsedWeight }) }
        : assessment ? { path: `${path}/${assessment.id}`, method: 'PATCH', body: updateAssessmentSchema.parse({ title, weight: parsedWeight, score: parsedScore, ...grouping }) }
          : { path, method: 'POST', body: createAssessmentSchema.parse({ id, title, weight: parsedWeight, score: parsedScore, ...grouping }) });
    } catch (error) { setMessage(error instanceof ZodError ? error.issues[0].message : 'Check the assessment details.'); }
  };
  const weightLabel = groupId ? 'Share of group' : 'Weight (%)';
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.title}>{canvas ? assessment.title : assessment ? 'Edit assessment' : 'New assessment'}</Text>
        {canvas ? <Text style={styles.meta}>Imported from Canvas: {amount(canvas.pointsPossible)} points, {assessment.score === null ? 'not graded yet' : `scored ${amount(assessment.score)}%`}.
          The name, score and group follow Canvas. Change the weight to match your outline, or set it to 0 to leave this out of your grade.</Text>
          : <Text style={styles.meta}>Use the weights from your course outline. Leave the score blank until it’s graded.</Text>}
        {!canvas && <Field label="Assessment name" value={title} onChangeText={setTitle} placeholder="Midterm exam" editable={!busy}/>}
        {!canvas && groups.length > 0 && <View style={styles.field}>
          <Text style={styles.label}>Group</Text>
          <View style={styles.chips}>{[null, ...groups].map(group => {
            const value = group?.id ?? null, chosen = groupId === value;
            return <Pressable key={value ?? 'none'} accessibilityRole="radio" accessibilityState={{ checked: chosen, disabled: busy }} disabled={busy}
              accessibilityLabel={group ? `Group ${group.title}` : 'No group'} onPress={() => setGroupId(value)} style={[styles.chip, chosen && styles.chosen]}>
              <Text style={[styles.chipText, chosen && styles.chosenText]}>{group?.title ?? 'No group'}</Text></Pressable>;
          })}</View>
        </View>}
        <Field label={weightLabel} value={weight} onChangeText={setWeight} placeholder={groupId ? 'Points, e.g. 20' : '30'} keyboardType="decimal-pad" editable={!busy}/>
        {groupId && <Text style={styles.meta}>Inside a group, assessments split the group’s weight by this share. Using points possible works well.</Text>}
        {!canvas && <Field label="Score (%)" value={score} onChangeText={setScore} placeholder="Not graded yet" keyboardType="decimal-pad" editable={!busy}/>}
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={busy ? 'Saving…' : canvas ? 'Save weight' : assessment ? 'Save assessment' : 'Add assessment'} disabled={busy} onPress={submit}/>
        {assessment && canvas?.weightEdited && <Button title={`Use the Canvas weight (${amount(canvas.pointsPossible)})`} tone="plain" disabled={busy}
          onPress={() => { void run({ path: `${path}/${assessment.id}`, method: 'PATCH', body: { resetWeight: true } }); }}/>}
        <Button title="Cancel" tone="plain" disabled={busy} onPress={onClose}/>
        {assessment && !canvas && <Button title="Delete assessment" tone="danger" disabled={busy}
          onPress={() => { void run({ path: `${path}/${assessment.id}`, method: 'DELETE' }); }}/>}
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' }, meta: { color: colors.muted, lineHeight: 21 }, error: { color: colors.coral },
  field: { gap: 8 }, label: { color: colors.ink, fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  chosen: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.ink, fontWeight: '700' }, chosenText: { color: colors.onAccent },
});
