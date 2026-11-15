import { useRef, useState } from 'react';
import { createTaskTemplateSchema, taskTemplateSchema } from '@campusflow/contracts';
import type { z } from 'zod';
import { TaskEditor } from '@/features/task-editor';
import { useSessionStore } from '@/store/session';
import { TaskTemplateEditor } from '@/features/task-template-editor';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, State, colors } from '@/components/ui';
import { SheetModal } from '@/components/sheet-modal';
import { useAction, useTaskTemplates } from '@/features/queries';

export function TaskTemplateList({ onClose }: { onClose(): void }) {
  const templates = useTaskTemplates();
  const action = useAction();
  const deletingNow = useRef(false);
  const [deleting, setDeleting] = useState<z.infer<typeof taskTemplateSchema>>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const remove = async () => {
    if (!deleting || deletingNow.current) return;
    deletingNow.current = true; setBusy(true); setMessage(undefined);
    try {
      await action.mutateAsync({ path: '/task-templates/' + deleting.id, method: 'DELETE' });
      setDeleting(undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete the template. Please try again.');
    } finally { deletingNow.current = false; setBusy(false); }
  };
  const session = useSessionStore(state => state.session);
  const [using, setUsing] = useState<z.infer<typeof taskTemplateSchema>>();
  const [editing, setEditing] = useState<z.infer<typeof taskTemplateSchema>>();
  const [duplicating, setDuplicating] = useState<z.infer<typeof createTaskTemplateSchema>>();
  if (deleting) return <SheetModal visible animationType="slide" onRequestClose={() => { if (!busy) setDeleting(undefined); }}>
    <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}><Card>
      <Text accessibilityRole="header" style={styles.heading}>Delete template?</Text>
      <Text style={styles.meta}>Delete "{deleting.title}"? Tasks already created from it will stay unchanged.</Text>
      {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
      <Button title={busy ? 'Deleting...' : 'Delete template'} tone="danger" disabled={busy} onPress={() => { void remove(); }}/>
      <Button title="Keep template" tone="plain" disabled={busy} onPress={() => setDeleting(undefined)}/>
    </Card></ScrollView></SafeAreaView>
  </SheetModal>;
  if (using) return <TaskEditor key={using.id} task={null} timeZone={session?.user.timeZone ?? 'UTC'}
    initialValues={{ title: using.title, description: using.description ?? '', estimatedMinutes: using.estimatedMinutes?.toString() ?? '' }}
    initialChecklist={using.checklist} onClose={onClose}/>;
  if (duplicating) return <TaskTemplateEditor initialValues={duplicating} onClose={() => setDuplicating(undefined)}/>;
  if (editing) return <TaskTemplateEditor key={editing.id} template={editing} onClose={() => setEditing(undefined)}/>;
  return <SheetModal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Task templates</Text>
        {templates.isLoading && <Text style={styles.meta}>Loading templates…</Text>}
        {!!templates.error && <>
          <Text accessibilityRole="alert" style={styles.error}>Could not refresh templates. Saved templates are shown when available.</Text>
          <Button title="Retry" tone="plain" disabled={templates.isFetching} onPress={() => { void templates.refetch(); }}/>
        </>}
        {!templates.isLoading && !templates.error && templates.data?.length === 0 && <State empty="No templates yet."/>}
        {templates.data?.map(template => <Card key={template.id}>
          <Text accessibilityRole="header" style={styles.heading}>{template.title}</Text>
          {!!template.description && <Text style={styles.meta}>{template.description}</Text>}
          {template.estimatedMinutes !== null && <Text style={styles.meta}>{template.estimatedMinutes} min</Text>}
          {template.checklist.length > 0 && <Text style={styles.label}>Checklist</Text>}
          {template.checklist.map((step, index) => <Text key={index} style={styles.meta}>{index + 1}. {step}</Text>)}
          <Button title="Use template" onPress={() => setUsing({ ...template, checklist: [...template.checklist] })}/>
          <Button title="Edit template" tone="plain" onPress={() => setEditing(template)}/>
          <Button title="Duplicate template" tone="plain" onPress={() => setDuplicating({
            title: ('Copy of ' + template.title).slice(0, createTaskTemplateSchema.shape.title.maxLength!),
            description: template.description, estimatedMinutes: template.estimatedMinutes, checklist: [...template.checklist],
          })}/>
          <Button title="Delete template" tone="danger" onPress={() => { setMessage(undefined); setDeleting(template); }}/>
        </Card>)}
        <Button title="Close templates" tone="plain" onPress={onClose}/>
      </ScrollView>
    </SafeAreaView>
  </SheetModal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  label: { color: colors.ink, fontWeight: '700' }, meta: { color: colors.muted }, error: { color: colors.coral },
});
