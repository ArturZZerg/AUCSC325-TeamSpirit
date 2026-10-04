import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { categorySchema, prioritySchema } from '@campusflow/contracts';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { taskFormDefaults, taskFormRequest, taskFormSchema, type TaskFormValues } from '@/features/task-form';
import type { PersonalTask } from '@/lib/types';

export function TaskEditor({ task, onClose }: { task: PersonalTask | null; onClose: () => void }) {
  const action = useAction();
  const [message, setMessage] = useState<string>();
  const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema(task)), defaultValues: taskFormDefaults(task),
  });
  const dueMode = watch('dueMode');
  const close = () => { if (!isSubmitting) onClose(); };
  const save = async (values: TaskFormValues) => {
    setMessage(undefined);
    try { await action.mutateAsync(taskFormRequest(values, task)); onClose(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the task. Please try again.'); }
  };
  const error = errors.title?.message || errors.description?.message || errors.dueDate?.message || errors.category?.message || errors.priority?.message || message;

  return <Modal visible animationType="slide" onRequestClose={close}>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{task ? 'Edit task' : 'New task'}</Text>
          <Controller name="title" control={control} render={({ field }) => <Field label="Title" value={field.value} onChangeText={field.onChange} editable={!isSubmitting}/>}/>
          <Controller name="description" control={control} render={({ field }) => <Field label="Description" value={field.value} onChangeText={field.onChange} editable={!isSubmitting} multiline/>}/>
          <Controller name="dueMode" control={control} render={({ field }) => <Choices label="Deadline" value={field.value} onChange={field.onChange} disabled={isSubmitting}
            options={[{ value: 'none', label: 'No deadline' }, { value: 'date', label: 'Date only' }, ...(task?.due?.kind === 'instant' ? [{ value: 'existing', label: 'Keep timed deadline' }] : [])]}/>}/>
          {dueMode === 'existing' && task?.due?.kind === 'instant' && <Text style={styles.meta}>Current deadline: {new Date(task.due.at).toLocaleString()}</Text>}
          {dueMode === 'date' && <Controller name="dueDate" control={control} render={({ field }) => <Field label="Due date" value={field.value} onChangeText={field.onChange} placeholder="YYYY-MM-DD" autoCorrect={false} editable={!isSubmitting}/>}/>}
          <Controller name="category" control={control} render={({ field }) => <Choices label="Category" value={field.value} onChange={field.onChange} disabled={isSubmitting} options={categorySchema.options.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}/>}/>
          <Controller name="priority" control={control} render={({ field }) => <Choices label="Priority" value={field.value} onChange={field.onChange} disabled={isSubmitting} options={prioritySchema.options.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}/>}/>
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Button title={isSubmitting ? 'Saving…' : 'Save task'} onPress={handleSubmit(save)} disabled={isSubmitting}/>
          <Button title="Cancel" tone="plain" onPress={close} disabled={isSubmitting}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

function Choices({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled: boolean }) {
  return <View style={styles.group}><Text style={styles.label}>{label}</Text><View style={styles.choices}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: value === option.value, disabled }}
      disabled={disabled} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.selected]}>
      <Text style={styles.label}>{option.label}</Text>
    </Pressable>)}
  </View></View>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, gap: 14, flexGrow: 1 }, title: { fontSize: 28, color: colors.ink, fontWeight: '800' }, group: { gap: 6 }, label: { color: colors.ink, fontWeight: '700' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 46, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, backgroundColor: colors.card }, selected: { backgroundColor: colors.sage, borderColor: colors.moss }, meta: { color: colors.muted }, error: { color: colors.coral } });
