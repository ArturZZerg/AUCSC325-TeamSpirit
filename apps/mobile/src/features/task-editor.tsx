import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { categorySchema, prioritySchema } from '@campusflow/contracts';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { taskFormDefaults, taskFormRequest, taskFormSchema, taskTimingLabel, type TaskFormValues } from '@/features/task-form';
import type { PersonalTask } from '@/lib/types';

export function TaskEditor({ task, onClose, timeZone = 'UTC' }: { task: PersonalTask | null; onClose: () => void; timeZone?: string }) {
  const action = useAction();
  const saving = useRef(false);
  const [message, setMessage] = useState<string>();
  const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema(task, timeZone)), defaultValues: taskFormDefaults(task, timeZone),
  });
  const dueMode = watch('dueMode');
  const scheduledMode = watch('scheduledMode'); const recurrenceMode = watch('recurrenceMode');
  const close = () => { if (!isSubmitting && !saving.current) onClose(); };
  const save = async (values: TaskFormValues) => {
    setMessage(undefined);
    try { await action.mutateAsync(taskFormRequest(values, task, timeZone)); onClose(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the task. Please try again.'); }
  };
  const submit = async () => {
    if (saving.current) return;
    saving.current = true;
    try { await handleSubmit(save)(); }
    finally { saving.current = false; }
  };
  const error = errors.title?.message || errors.description?.message || errors.dueDate?.message || errors.dueTime?.message
    || errors.scheduledDate?.message || errors.scheduledTime?.message || errors.interval?.message || errors.weekdays?.message || message;

  return <Modal visible animationType="slide" onRequestClose={close}>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{task ? 'Edit task' : 'New task'}</Text>
          <Text style={styles.meta}>Dates and times follow your account time zone: {timeZone}.</Text>
          <Controller name="title" control={control} render={({ field }) => <Field label="Title" value={field.value} onChangeText={field.onChange} editable={!isSubmitting}/>}/>
          <Controller name="description" control={control} render={({ field }) => <Field label="Description" value={field.value} onChangeText={field.onChange} editable={!isSubmitting} multiline/>}/>
          <Controller name="dueMode" control={control} render={({ field }) => <Choices label="Deadline" value={field.value} onChange={field.onChange} disabled={isSubmitting}
            options={[{ value: 'none', label: 'No deadline' }, { value: 'date', label: 'Date only' }, { value: 'instant', label: 'Timed deadline' }, ...(task?.due?.kind === 'instant' ? [{ value: 'existing', label: 'Keep timed deadline' }] : [])]}/>}/>
          {dueMode === 'existing' && task?.due?.kind === 'instant' && <Text style={styles.meta}>Current deadline: {taskTimingLabel(task.due, timeZone)}</Text>}
          {(dueMode === 'date' || dueMode === 'instant') && <Controller name="dueDate" control={control} render={({ field }) => <Field label="Due date" value={field.value} onChangeText={field.onChange} placeholder="YYYY-MM-DD" autoCorrect={false} editable={!isSubmitting}/>}/>}
          {dueMode === 'instant' && <Controller name="dueTime" control={control} render={({ field }) => <Field label="Due time" value={field.value} onChangeText={field.onChange} placeholder="HH:MM" autoCorrect={false} editable={!isSubmitting}/>}/>}
          <Controller name="scheduledMode" control={control} render={({ field }) => <Choices label="Scheduled" value={field.value} onChange={field.onChange} disabled={isSubmitting}
            options={[{ value: 'none', label: 'Not scheduled' }, { value: 'date', label: 'Scheduled date only' }, { value: 'instant', label: 'Scheduled date and time' }, ...(task?.scheduled?.kind === 'instant' ? [{ value: 'existing', label: 'Keep scheduled time' }] : [])]}/>}/>
          {scheduledMode === 'existing' && <Text style={styles.meta}>Current schedule: {taskTimingLabel(task?.scheduled ?? null, timeZone)}</Text>}
          {(scheduledMode === 'date' || scheduledMode === 'instant') && <Controller name="scheduledDate" control={control} render={({ field }) => <Field label="Scheduled date" value={field.value} onChangeText={field.onChange} placeholder="YYYY-MM-DD" autoCorrect={false} editable={!isSubmitting}/>}/>}
          {scheduledMode === 'instant' && <Controller name="scheduledTime" control={control} render={({ field }) => <Field label="Scheduled time" value={field.value} onChangeText={field.onChange} placeholder="HH:MM" autoCorrect={false} editable={!isSubmitting}/>}/>}
          <Text style={styles.meta}>Scheduling chooses when to work; a deadline stays separate.</Text>
          <Controller name="recurrenceMode" control={control} render={({ field }) => <Choices label="Repeat" value={field.value} onChange={field.onChange} disabled={isSubmitting}
            options={[{ value: 'none', label: 'Does not repeat' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}/>}/>
          {recurrenceMode !== 'none' && <><Controller name="interval" control={control} render={({ field }) => <Field label={`Repeat every (${recurrenceMode === 'weekly' ? 'weeks' : 'days'})`} value={field.value} onChangeText={field.onChange} keyboardType="number-pad" editable={!isSubmitting}/>}/>
            <Text style={styles.meta}>Repeats start from the scheduled date, or the deadline when no schedule is set.</Text></>}
          {recurrenceMode === 'weekly' && <Controller name="weekdays" control={control} render={({ field }) => <View style={styles.choices}>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day}
              accessibilityState={{ checked: field.value.includes(index + 1), disabled: isSubmitting }} disabled={isSubmitting}
              onPress={() => field.onChange(field.value.includes(index + 1) ? field.value.filter(value => value !== index + 1) : [...field.value, index + 1])}
              style={[styles.choice, field.value.includes(index + 1) && styles.selected]}><Text style={styles.label}>{day}</Text></Pressable>)}
          </View>}/>}
          <Controller name="category" control={control} render={({ field }) => <Choices label="Category" value={field.value} onChange={field.onChange} disabled={isSubmitting} options={categorySchema.options.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}/>}/>
          <Controller name="priority" control={control} render={({ field }) => <Choices label="Priority" value={field.value} onChange={field.onChange} disabled={isSubmitting} options={prioritySchema.options.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}/>}/>
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Button title={isSubmitting ? 'Saving…' : 'Save task'} onPress={() => { void submit(); }} disabled={isSubmitting}/>
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
