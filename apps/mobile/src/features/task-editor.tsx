import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { categorySchema, dateSchema, personalTaskSchema, prioritySchema } from '@campusflow/contracts';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { taskFormDefaults, taskFormRequest, taskFormSchema, taskTimingLabel, type TaskFormValues } from '@/features/task-form';
import type { Course, PersonalTask } from '@/lib/types';
import { api, ApiError } from '@/lib/api';
import { useSessionStore } from '@/store/session';
import { taskCredentialsGeneration, taskOwnershipGeneration, taskOwnerCurrent, taskEditBaseline, taskEditBaselineCurrent, useTaskEditRevision, type TaskEditBaseline } from './task-edit-freshness';
import { courseLabel } from '@/features/course-label';
import { SheetModal } from '@/components/sheet-modal';

type EditorProps = {
  task: PersonalTask | null; onClose: () => void; timeZone?: string; initialValues?: Partial<TaskFormValues>;
  /** When supplied, the editor offers a course picker; otherwise the saved course is kept unchanged. */
  courses?: readonly Course[];
  initialScheduledDate?: string;
  onSaved?: () => void;
};
export function TaskEditor(props: EditorProps) {
  return props.task ? <ExistingTaskEditor {...props} task={props.task}/> : <TaskEditorForm {...props}/>;
}

function ExistingTaskEditor({ task, onClose, initialScheduledDate, onSaved, courses }: EditorProps & { task: PersonalTask }) {
  const owner = useSessionStore(state => state.session);
  useTaskEditRevision();
  const [loaded, setLoaded] = useState<{ task: PersonalTask; baseline: TaskEditBaseline }>();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fresh = Boolean(loaded && taskEditBaselineCurrent(loaded.baseline));
  const reload = async () => {
    const baseline = owner && taskEditBaseline(owner, task.id);
    if (!baseline) { setMessage('Wait for task changes to finish, then reload.'); return; }
    const serial = ++request.current;
    clearTimeout(deadline.current);
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setLoading(true); setMessage(undefined);
    const timeout = setTimeout(() => {
      abort.abort();
      if (serial === request.current) { request.current++; setLoading(false); setMessage('Could not load the task. Please reload to edit.'); }
    }, 15_000);
    deadline.current = timeout;
    try {
      const value = personalTaskSchema.parse(await api(`/tasks/${task.id}`, { signal: abort.signal,
        headers: { Authorization: `Bearer ${baseline.owner.accessToken}` }, cache: 'no-store' }));
      if (serial !== request.current || abort.signal.aborted) return;
      if (value.id !== task.id || !taskEditBaselineCurrent(baseline)) {
        setMessage('Task or session changed. Reload before editing.'); return;
      }
      setLoaded({ task: value, baseline });
    } catch (error) {
      if (serial === request.current && !abort.signal.aborted) setMessage(error instanceof ApiError && error.status === 404
        ? 'This task is no longer available.' : 'Could not load the task. Please reload to edit.');
    } finally { clearTimeout(timeout); if (serial === request.current) setLoading(false); }
  };
  // Only opening triggers a read. A stale draft requires an explicit reload.
  useEffect(() => {
    void reload();
    return () => { request.current++; controller.current?.abort(); clearTimeout(deadline.current); };
  }, [task.id]);
  const sameCredentials = loaded && loaded.task.id === task.id && owner?.user.id === loaded.baseline.owner.user.id
    && owner.accessToken === loaded.baseline.owner.accessToken && loaded.baseline.credentialsGeneration === taskCredentialsGeneration();
  if (!loaded || !sameCredentials) return <SheetModal visible onRequestClose={onClose}><SafeAreaView style={styles.content}>
    <Text style={{ color: colors.ink }}>{loading ? 'Loading task for editing…' : message ?? 'Reload the task before editing.'}</Text>
    <Button title="Reload task" onPress={() => { void reload(); }} disabled={loading || !owner}/>
    <Button title="Cancel" onPress={onClose}/>
  </SafeAreaView></SheetModal>;
  return <TaskEditorForm task={loaded.task} onClose={onClose} timeZone={owner?.user.timeZone ?? 'UTC'} courses={courses}
    initialScheduledDate={initialScheduledDate} onSaved={onSaved} baseline={loaded.baseline} stale={!fresh || loading} freshnessMessage={message} reload={() => { void reload(); }} loading={loading}/>;
}

// The form is separate so field validation tests can isolate it from the online
// gate. Production existing-task entry points always use TaskEditor above.
export function TaskEditorForm({ task, onClose, onSaved, timeZone = 'UTC', initialValues, initialScheduledDate, baseline, stale = false, freshnessMessage, reload, loading, courses }: EditorProps & {
  baseline?: TaskEditBaseline; stale?: boolean; freshnessMessage?: string; reload?: () => void; loading?: boolean;
}) {
  const action = useAction();
  const saving = useRef(false);
  const [message, setMessage] = useState<string>();
  const { control, handleSubmit, watch, reset, getValues, setValue, formState: { errors, isSubmitting, dirtyFields } } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema(task, timeZone)),
    defaultValues: { ...taskFormDefaults(task, timeZone), ...(!task ? initialValues : undefined) },
  });
  const schedulePrefilled = useRef(false);
  useEffect(() => {
    if (!schedulePrefilled.current && initialScheduledDate && task && !task.completedAt && !task.recurrence && dateSchema.safeParse(initialScheduledDate).success) {
      schedulePrefilled.current = true;
      setValue('scheduledMode', 'date', { shouldDirty: true });
      setValue('scheduledDate', initialScheduledDate, { shouldDirty: true });
      setValue('scheduledTime', '', { shouldDirty: true });
    }
  }, [initialScheduledDate, task, setValue]);
  // Preserve controls belonging to one DTO field together, but rebase deadline,
  // schedule and recurrence independently so unchanged server fields survive.
  const appliedBaseline = useRef(baseline);
  useEffect(() => {
    if (baseline && baseline !== appliedBaseline.current) {
      appliedBaseline.current = baseline;
      const next = taskFormDefaults(task, timeZone), draft = getValues();
      const groups: (keyof TaskFormValues)[][] = [['dueMode', 'dueDate', 'dueTime'],
        ['scheduledMode', 'scheduledDate', 'scheduledTime'], ['recurrenceMode', 'interval', 'weekdays']];
      for (const group of groups) if (group.some(field => dirtyFields[field])) {
        Object.assign(next, Object.fromEntries(group.map(field => [field, draft[field]])));
      }
      reset(next, { keepDirtyValues: true });
    }
  }, [baseline, reset, getValues, dirtyFields, task, timeZone]);
  const rebasing = Boolean(baseline && baseline !== appliedBaseline.current);
  const blocked = isSubmitting || stale || rebasing;
  const dueMode = watch('dueMode');
  const scheduledMode = watch('scheduledMode'); const recurrenceMode = watch('recurrenceMode');
  const needsUndo = Boolean(task?.completedAt && !task.recurrence);
  const close = () => { if (!isSubmitting && !saving.current) onClose(); };
  const save = async (values: TaskFormValues) => {
    setMessage(undefined);
    const confirmationOwner = onSaved ? useSessionStore.getState().session : null;
    const confirmationOwnership = taskOwnershipGeneration(), confirmationCredentials = taskCredentialsGeneration();
    try {
      if (baseline && !taskEditBaselineCurrent(baseline)) throw new Error('Reload the task before saving.');
      await action.mutateAsync({ ...taskFormRequest(values, task, timeZone), ...(baseline ? { taskEditBaseline: baseline } : {}) });
      if (confirmationOwner && taskOwnerCurrent(confirmationOwner) && taskOwnershipGeneration() === confirmationOwnership
        && taskCredentialsGeneration() === confirmationCredentials) onSaved?.();
      onClose();
    }
    catch (error) { setMessage(error instanceof TypeError ? 'Couldn’t confirm the save. Check your connection and saved tasks before retrying.'
      : error instanceof Error ? error.message : 'Could not save the task. Please try again.'); }
  };
  const submit = async () => {
    if (saving.current || stale || rebasing) return;
    saving.current = true;
    try { await handleSubmit(save)(); }
    finally { saving.current = false; }
  };
  const error = errors.title?.message || errors.description?.message || errors.estimatedMinutes?.message || errors.dueDate?.message || errors.dueTime?.message
    || errors.scheduledDate?.message || errors.scheduledTime?.message || errors.recurrenceMode?.message || errors.interval?.message || errors.weekdays?.message || message;

  return <SheetModal visible animationType="slide" onRequestClose={close}>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{task ? 'Edit task' : 'New task'}</Text>
          {initialScheduledDate && task && <Text style={styles.meta}>{task.completedAt || task.recurrence
            ? 'This task is now complete or repeating. Review its current state before changing the schedule.'
            : dateSchema.safeParse(initialScheduledDate).success ? 'Your chosen day is prefilled as a schedule. Review it before saving; the deadline stays separate.'
              : 'The chosen day could not be prefilled. Select a scheduled date before saving.'}</Text>}
          <Text style={styles.meta}>Dates and times follow your account time zone: {timeZone}.</Text>
          {stale && <><Text accessibilityRole="alert" style={{ color: colors.ink }}>{freshnessMessage ?? 'Task changed. Reload before saving; your draft will be kept.'}</Text>
            <Button title="Reload task" onPress={reload!} disabled={isSubmitting || loading}/></>}
          <Controller name="title" control={control} render={({ field }) => <Field testID="task-title" label="Title" value={field.value} onChangeText={field.onChange} editable={!blocked}/>}/>
          <Controller name="description" control={control} render={({ field }) => <Field label="Description" value={field.value} onChangeText={field.onChange} editable={!blocked} multiline/>}/>
          <Controller name="estimatedMinutes" control={control} render={({ field }) => <Field label="Estimated minutes (optional)" value={field.value} onChangeText={field.onChange} keyboardType="number-pad" placeholder="e.g. 30" editable={!blocked}/>}/>
          <Text style={styles.meta}>Use 1–1440 whole minutes. Leave blank to remove the estimate.</Text>
          <Controller name="dueMode" control={control} render={({ field }) => <Choices label="Deadline" value={field.value} onChange={field.onChange} disabled={blocked}
            options={[{ value: 'none', label: 'No deadline' }, { value: 'date', label: 'Date only' }, { value: 'instant', label: 'Timed deadline' }, ...(task?.due?.kind === 'instant' ? [{ value: 'existing', label: 'Keep timed deadline' }] : [])]}/>}/>
          {dueMode === 'existing' && task?.due?.kind === 'instant' && <Text style={styles.meta}>Current deadline: {taskTimingLabel(task.due, timeZone)}</Text>}
          {(dueMode === 'date' || dueMode === 'instant') && <Controller name="dueDate" control={control} render={({ field }) => <Field label="Due date" value={field.value} onChangeText={field.onChange} placeholder="YYYY-MM-DD" autoCorrect={false} editable={!blocked}/>}/>}
          {dueMode === 'instant' && <Controller name="dueTime" control={control} render={({ field }) => <Field label="Due time" value={field.value} onChangeText={field.onChange} placeholder="HH:MM" autoCorrect={false} editable={!blocked}/>}/>}
          <Controller name="scheduledMode" control={control} render={({ field }) => <Choices label="Scheduled" value={field.value} onChange={field.onChange} disabled={blocked}
            options={[{ value: 'none', label: 'Not scheduled' }, { value: 'date', label: 'Scheduled date only' }, { value: 'instant', label: 'Scheduled date and time' }, ...(task?.scheduled?.kind === 'instant' ? [{ value: 'existing', label: 'Keep scheduled time' }] : [])]}/>}/>
          {scheduledMode === 'existing' && <Text style={styles.meta}>Current schedule: {taskTimingLabel(task?.scheduled ?? null, timeZone)}</Text>}
          {(scheduledMode === 'date' || scheduledMode === 'instant') && <Controller name="scheduledDate" control={control} render={({ field }) => <Field label="Scheduled date" value={field.value} onChangeText={field.onChange} placeholder="YYYY-MM-DD" autoCorrect={false} editable={!blocked}/>}/>}
          {scheduledMode === 'instant' && <Controller name="scheduledTime" control={control} render={({ field }) => <Field label="Scheduled time" value={field.value} onChangeText={field.onChange} placeholder="HH:MM" autoCorrect={false} editable={!blocked}/>}/>}
          <Text style={styles.meta}>Scheduling chooses when to work; a deadline stays separate.</Text>
          {needsUndo && <Text style={styles.meta}>Cancel and undo completion before adding a repeat rule.</Text>}
          <Controller name="recurrenceMode" control={control} render={({ field }) => <Choices label="Repeat" value={field.value} onChange={field.onChange} disabled={blocked || needsUndo}
            options={task?.studyPlanId ? [{ value: 'none', label: 'Does not repeat' }] : [{ value: 'none', label: 'Does not repeat' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}/>}/>
          {task?.studyPlanId && <Text style={styles.meta}>This is one session in a study plan. Create a separate task for recurring study.</Text>}
          {recurrenceMode !== 'none' && <><Controller name="interval" control={control} render={({ field }) => <Field label={`Repeat every (${recurrenceMode === 'weekly' ? 'weeks' : 'days'})`} value={field.value} onChangeText={field.onChange} keyboardType="number-pad" editable={!blocked}/>}/>
            <Text style={styles.meta}>Repeats start from the scheduled date, or the deadline when no schedule is set.</Text></>}
          {recurrenceMode === 'weekly' && <Controller name="weekdays" control={control} render={({ field }) => <View style={styles.choices}>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day}
              accessibilityState={{ checked: field.value.includes(index + 1), disabled: blocked }} disabled={blocked}
              onPress={() => field.onChange(field.value.includes(index + 1) ? field.value.filter(value => value !== index + 1) : [...field.value, index + 1])}
              style={[styles.choice, field.value.includes(index + 1) && styles.selected]}><Text style={styles.label}>{day}</Text></Pressable>)}
          </View>}/>}
          <Controller name="category" control={control} render={({ field }) => <Choices label="Category" value={field.value} onChange={field.onChange} disabled={blocked} options={categorySchema.options.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}/>}/>
          {!!courses?.length && <Controller name="courseId" control={control} render={({ field }) => <Choices label="Course" value={field.value} onChange={value => {
            field.onChange(value);
            // A course implies university work unless the student already chose otherwise.
            if (value && !dirtyFields.category && getValues('category') === 'personal') setValue('category', 'university', { shouldDirty: true });
          }} disabled={blocked} options={[{ value: '', label: 'No course' }, ...courses.filter(course => course.active || course.id === field.value)
            .map(course => ({ value: course.id, label: courseLabel(course) }))]}/>}/>}
          <Controller name="priority" control={control} render={({ field }) => <Choices label="Priority" value={field.value} onChange={field.onChange} disabled={blocked} options={prioritySchema.options.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}/>}/>
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Button title={isSubmitting ? 'Saving…' : 'Save task'} onPress={() => { void submit(); }} disabled={blocked}/>
          <Button title="Cancel" tone="plain" onPress={close} disabled={isSubmitting}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </SheetModal>;
}

function Choices({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled: boolean }) {
  return <View style={styles.group}><Text style={styles.label}>{label}</Text><View style={styles.choices}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} aria-checked={value === option.value} accessibilityState={{ checked: value === option.value, disabled }}
      disabled={disabled} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.selected]}>
      <Text style={styles.label}>{option.label}</Text>
    </Pressable>)}
  </View></View>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, gap: 14, flexGrow: 1 }, title: { fontSize: 28, color: colors.ink, fontWeight: '800' }, group: { gap: 6 }, label: { color: colors.ink, fontWeight: '700' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 46, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, backgroundColor: colors.card }, selected: { backgroundColor: colors.sage, borderColor: colors.moss }, meta: { color: colors.muted }, error: { color: colors.coral } });
