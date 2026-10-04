import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { taskReminderDefaults, taskReminderFormSchema, taskReminderRequest, type TaskReminderForm } from '@/features/task-reminder-form';
import { taskTimingLabel } from '@/features/task-form';
import type { PersonalTask } from '@/lib/types';
export function TaskReminderEditor({ task, timeZone, onClose }: { task: PersonalTask; timeZone: string; onClose(): void }) {
  const action = useAction(); const saving = useRef(false); const [message, setMessage] = useState<string>();
  const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<TaskReminderForm>({
    resolver: zodResolver(taskReminderFormSchema(task, timeZone)), defaultValues: taskReminderDefaults(task, timeZone),
  });
  const close = () => { if (!isSubmitting && !saving.current) onClose(); };
  const save = async (values: TaskReminderForm) => {
    setMessage(undefined);
    try { if (values.mode !== 'existing') await action.mutateAsync(taskReminderRequest(values, task, timeZone)); onClose(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the reminder. Please try again.'); }
  };
  const submit = async () => {
    if (saving.current) return; saving.current = true;
    try { await handleSubmit(save)(); } finally { saving.current = false; }
  };
  const mode = watch('mode'); const error = errors.date?.message || errors.time?.message || message;
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Task reminder</Text><Text style={styles.label}>{task.title}</Text>
        <Text style={styles.meta}>One reminder at the date and time you choose, in {timeZone}.</Text>
        {task.completedAt && <Text style={styles.meta}>Undo completion to reactivate a future reminder.</Text>}
        {task.reminder?.kind === 'date' && <Text style={styles.meta}>Choose a delivery time for your saved date-only reminder.</Text>}
        <Controller name="mode" control={control} render={({ field }) => <View style={styles.options}>
          {[{ value: 'none', label: 'No reminder' }, { value: 'instant', label: 'Choose date and time' }, ...(task.reminder?.kind === 'instant' ? [{ value: 'existing', label: 'Keep current reminder' }] : [])].map(option => <Pressable key={option.value}
            accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: field.value === option.value, disabled: isSubmitting }} disabled={isSubmitting}
            onPress={() => field.onChange(option.value)} style={[styles.choice, field.value === option.value && styles.selected]}><Text style={styles.label}>{option.label}</Text></Pressable>)}
        </View>}/>
        {mode === 'existing' && <Text style={styles.meta}>Current reminder: {taskTimingLabel(task.reminder, timeZone)}</Text>}
        {mode === 'instant' && <><Controller name="date" control={control} render={({ field }) => <Field label="Reminder date" value={field.value} onChangeText={field.onChange} placeholder="YYYY-MM-DD" autoCorrect={false} editable={!isSubmitting}/>}/>
          <Controller name="time" control={control} render={({ field }) => <Field label="Reminder time" value={field.value} onChangeText={field.onChange} placeholder="HH:MM" autoCorrect={false} editable={!isSubmitting}/>}/></>}
        <Text style={styles.meta}>Allow device notifications in Settings for delivery. Quiet hours and category preferences also apply.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button title={isSubmitting ? 'Saving…' : 'Save reminder'} disabled={isSubmitting} onPress={() => { void submit(); }}/><Button title="Cancel" tone="plain" disabled={isSubmitting} onPress={close}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 16, gap: 12 }, title: { fontSize: 26, fontWeight: '800', color: colors.ink }, label: { color: colors.ink, fontWeight: '700' }, meta: { color: colors.muted }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line }, selected: { backgroundColor: colors.sage, borderColor: colors.moss }, error: { color: colors.coral } });
