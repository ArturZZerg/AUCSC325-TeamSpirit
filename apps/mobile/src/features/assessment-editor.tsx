import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZodError } from 'zod';
import { createAssessmentSchema, updateAssessmentSchema } from '@campusflow/contracts';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { newStepId } from '@/features/task-checklist';

type Assessment = { id: string; title: string; weight: number; score: number | null };
const number = (value: string) => value.trim() === '' ? null : Number(value.trim().replace(',', '.').replace(/%$/, ''));

/** Add or edit one weighted assessment. Weight and score are percentages; score may stay blank until graded. */
export function AssessmentEditor({ courseId, assessment, onClose }: { courseId: string; assessment: Assessment | null; onClose(): void }) {
  const action = useAction();
  const saving = useRef(false);
  const [id] = useState(() => assessment?.id ?? newStepId());
  const [title, setTitle] = useState(assessment?.title ?? ''), [weight, setWeight] = useState(assessment ? String(assessment.weight) : '');
  const [score, setScore] = useState(assessment?.score === null || !assessment ? '' : String(assessment.score));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string>();
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
    const parsedWeight = number(weight), parsedScore = number(score);
    if (parsedWeight === null || Number.isNaN(parsedWeight)) { setMessage('Enter the weight as a percentage, such as 30.'); return; }
    if (parsedScore !== null && Number.isNaN(parsedScore)) { setMessage('Enter the score as a percentage, or leave it blank.'); return; }
    try {
      void run(assessment
        ? { path: `/courses/${courseId}/assessments/${assessment.id}`, method: 'PATCH', body: updateAssessmentSchema.parse({ title, weight: parsedWeight, score: parsedScore }) }
        : { path: `/courses/${courseId}/assessments`, method: 'POST', body: createAssessmentSchema.parse({ id, title, weight: parsedWeight, score: parsedScore }) });
    } catch (error) { setMessage(error instanceof ZodError ? error.issues[0].message : 'Check the assessment details.'); }
  };
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.title}>{assessment ? 'Edit assessment' : 'New assessment'}</Text>
        <Text style={styles.meta}>Use the weights from your course outline. Leave the score blank until it’s graded.</Text>
        <Field label="Assessment name" value={title} onChangeText={setTitle} placeholder="Midterm exam" editable={!busy}/>
        <Field label="Weight (%)" value={weight} onChangeText={setWeight} placeholder="30" keyboardType="decimal-pad" editable={!busy}/>
        <Field label="Score (%)" value={score} onChangeText={setScore} placeholder="Not graded yet" keyboardType="decimal-pad" editable={!busy}/>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={busy ? 'Saving…' : assessment ? 'Save assessment' : 'Add assessment'} disabled={busy} onPress={submit}/>
        <Button title="Cancel" tone="plain" disabled={busy} onPress={onClose}/>
        {assessment && <Button title="Delete assessment" tone="danger" disabled={busy}
          onPress={() => { void run({ path: `/courses/${courseId}/assessments/${assessment.id}`, method: 'DELETE' }); }}/>}
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' }, meta: { color: colors.muted, lineHeight: 21 }, error: { color: colors.coral },
});
