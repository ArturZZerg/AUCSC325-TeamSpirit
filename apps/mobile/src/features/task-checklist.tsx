import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { checklistLimit, createChecklistItemSchema } from '@campusflow/contracts';
import { colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import type { PersonalTask } from '@/lib/types';

/** RFC 4122 version-4 shaped ID so a retried add is recognised by the API. */
export const newStepId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
  const value = Math.floor(Math.random() * 16);
  return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
});

export const checklistProgress = (task: Pick<PersonalTask, 'checklist'>) => {
  const steps = task.checklist ?? [];
  return { done: steps.filter(step => step.done).length, total: steps.length };
};

/** Steps for one one-time task. Each change is a separate locked request; nothing is queued offline. */
export function TaskChecklist({ task, disabled }: { task: PersonalTask; disabled?: boolean }) {
  const action = useAction();
  const busy = useRef(false);
  const [pending, setPending] = useState<string>();
  const [draft, setDraft] = useState('');
  // A failed add keeps its ID so retrying the same text cannot create a duplicate.
  const [draftId, setDraftId] = useState(newStepId);
  const [message, setMessage] = useState<string>();
  const steps = task.checklist ?? [];
  const blocked = !!disabled || !!pending || action.isPending;
  const run = async (key: string, request: Parameters<typeof action.mutateAsync>[0]) => {
    if (busy.current || action.isPending) return false;
    busy.current = true; setPending(key); setMessage(undefined);
    try { await action.mutateAsync(request); return true; }
    catch (error) {
      setMessage(error instanceof TypeError ? 'Couldn’t confirm the change. Check your connection and retry.'
        : error instanceof Error ? error.message : 'Could not save the step. Please try again.');
      return false;
    } finally { busy.current = false; setPending(undefined); }
  };
  const add = async () => {
    const parsed = createChecklistItemSchema.safeParse({ id: draftId, title: draft });
    if (!parsed.success) { setMessage(parsed.error.issues[0].message); return; }
    if (await run('add', { path: `/tasks/${task.id}/checklist`, method: 'POST', body: parsed.data })) { setDraft(''); setDraftId(newStepId()); }
  };
  if (task.recurrence) return null;
  return <View style={styles.wrap}>
    <Text style={styles.heading}>Steps{steps.length ? ` · ${checklistProgress(task).done}/${steps.length}` : ''}</Text>
    {steps.map(step => <View key={step.id} style={styles.step}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={step.title} accessibilityState={{ checked: step.done, disabled: blocked }} disabled={blocked} hitSlop={6}
        onPress={() => { void run(step.id, { path: `/tasks/${task.id}/checklist/${step.id}`, method: 'PATCH', body: { done: !step.done } }); }}
        style={[styles.box, step.done && styles.boxDone, blocked && pending !== step.id && styles.dim]}>
        {pending === step.id ? <ActivityIndicator size="small" color={step.done ? colors.onAccent : colors.moss}/> : step.done ? <Ionicons name="checkmark" size={14} color={colors.onAccent}/> : null}
      </Pressable>
      <Text style={[styles.title, step.done && styles.done]}>{step.title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove step ${step.title}`} disabled={blocked} hitSlop={8}
        onPress={() => { void run(`remove:${step.id}`, { path: `/tasks/${task.id}/checklist/${step.id}`, method: 'DELETE' }); }} style={blocked && styles.dim}>
        <Ionicons name="close" size={16} color={colors.muted}/>
      </Pressable>
    </View>)}
    {steps.length < checklistLimit ? <View style={styles.add}>
      <Ionicons name="add" size={18} color={colors.moss}/>
      <TextInput accessibilityLabel={`Add a step to ${task.title}`} value={draft} onChangeText={value => { setDraft(value); setMessage(undefined); }}
        placeholder="Add a step" placeholderTextColor={colors.muted} style={styles.input} editable={!blocked} maxLength={240}
        returnKeyType="done" submitBehavior="submit" onSubmitEditing={() => { void add(); }}/>
      {!!draft.trim() && <Pressable accessibilityRole="button" accessibilityLabel="Add step" disabled={blocked} onPress={() => { void add(); }} hitSlop={6}>
        {pending === 'add' ? <ActivityIndicator size="small" color={colors.moss}/> : <Text style={styles.addText}>Add</Text>}</Pressable>}
    </View> : <Text style={styles.meta}>This task has the maximum of {checklistLimit} steps.</Text>}
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingVertical: 4 }, heading: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.moss, alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: colors.moss }, dim: { opacity: 0.45 },
  title: { flex: 1, color: colors.ink, fontSize: 15 }, done: { color: colors.muted, textDecorationLine: 'line-through' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 12, paddingHorizontal: 10, backgroundColor: colors.canvas },
  input: { flex: 1, minHeight: 38, color: colors.ink, fontSize: 15 }, addText: { color: colors.moss, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 12 }, error: { color: colors.coral },
});
