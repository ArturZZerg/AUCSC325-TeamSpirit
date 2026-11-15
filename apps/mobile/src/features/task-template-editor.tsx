import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZodError, type z } from 'zod';
import { checklistLimit, createTaskTemplateSchema, taskTemplateSchema, updateTaskTemplateSchema } from '@campusflow/contracts';
import { Button, Field, colors } from '@/components/ui';
import { SheetModal } from '@/components/sheet-modal';
import { useAction } from '@/features/queries';
import { taskFormSchema } from '@/features/task-form';

const fieldsSchema = taskFormSchema(null).innerType().pick({ title: true, description: true, estimatedMinutes: true });

/** Template creation and editing; tasks continue to use the existing task editor. */
export function TaskTemplateEditor({ template, initialValues, onClose }: {
  template?: z.infer<typeof taskTemplateSchema>;
  initialValues?: z.infer<typeof createTaskTemplateSchema>;
  onClose(): void;
}) {
  const action = useAction();
  const defaults = template ?? initialValues;
  const saving = useRef(false);
  const [title, setTitle] = useState(defaults?.title ?? ''), [description, setDescription] = useState(defaults?.description ?? '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(defaults?.estimatedMinutes?.toString() ?? '');
  const [checklist, setChecklist] = useState<string[]>(() => [...(defaults?.checklist ?? [])]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string>();
  const save = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setMessage(undefined);
    try {
      const values = fieldsSchema.parse({ title, description, estimatedMinutes });
      const body = (template ? updateTaskTemplateSchema : createTaskTemplateSchema).parse({ title: values.title,
        description: values.description || null, estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : null,
        checklist });
      await action.mutateAsync({ path: template ? '/task-templates/' + template.id : '/task-templates', method: template ? 'PATCH' : 'POST', body });
      onClose();
    } catch (error) {
      setMessage(error instanceof ZodError ? error.issues[0].message
        : error instanceof Error ? error.message : 'Could not save the template. Please try again.');
    } finally { saving.current = false; setBusy(false); }
  };
  return <SheetModal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.title}>{template ? 'Edit template' : 'New template'}</Text>
        <Field label="Title" value={title} onChangeText={setTitle} editable={!busy}/>
        <Field label="Description" value={description} onChangeText={setDescription} multiline editable={!busy}/>
        <Field label="Estimated minutes (optional)" value={estimatedMinutes} onChangeText={setEstimatedMinutes} keyboardType="number-pad" editable={!busy}/>
        <Text style={styles.label}>Checklist (optional)</Text>
        {checklist.map((step, index) => <View key={index} style={styles.step}>
          <Field label={'Checklist step ' + (index + 1)} value={step} editable={!busy}
            onChangeText={value => setChecklist(steps => steps.map((item, position) => position === index ? value : item))}/>
          <Button title={'Remove step ' + (index + 1)} tone="plain" disabled={busy}
            onPress={() => setChecklist(steps => steps.filter((_, position) => position !== index))}/>
        </View>)}
        <Button title="Add step" tone="plain" disabled={busy || checklist.length >= checklistLimit} onPress={() => setChecklist(steps => [...steps, ''])}/>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={busy ? 'Saving…' : 'Save template'} disabled={busy} onPress={() => { void save(); }}/>
        <Button title="Cancel" tone="plain" disabled={busy} onPress={onClose}/>
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </SheetModal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  label: { color: colors.ink, fontWeight: '700' }, step: { gap: 8 }, error: { color: colors.coral },
});
