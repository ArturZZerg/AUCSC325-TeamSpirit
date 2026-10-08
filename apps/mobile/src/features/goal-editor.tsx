import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { categorySchema } from '@campusflow/contracts';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { goalFormDefaults, goalFormRequest, goalFormSchema, type GoalFormValues } from '@/features/goal-form';
import type { Goal } from '@/lib/types';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function GoalEditor({ goal, timeZone, onClose, initialValues, onSaved }: {
  goal: Goal | null; timeZone: string; onClose(): void;
  initialValues?: Partial<GoalFormValues>; onSaved?(): void;
}) {
  const action = useAction();
  const saving = useRef(false);
  const [message, setMessage] = useState<string>();
  const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema), defaultValues: { ...goalFormDefaults(goal, timeZone), ...(!goal ? initialValues : undefined) },
  });
  const close = () => { if (!isSubmitting && !saving.current) onClose(); };
  const save = async (values: GoalFormValues) => {
    setMessage(undefined);
    try { await action.mutateAsync(goalFormRequest(values, goal)); onSaved?.(); onClose(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the goal. Please try again.'); }
  };
  const submit = async () => {
    if (saving.current) return;
    saving.current = true;
    try { await handleSubmit(save)(); }
    finally { saving.current = false; }
  };
  const error = errors.title?.message || errors.weekdays?.message || errors.target?.message || errors.timeZone?.message || message;
  const frequency = watch('frequency');
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{goal ? 'Edit goal' : 'New goal'}</Text>
        <Controller name="title" control={control} render={({ field }) => <Field label="Goal title" value={field.value} onChangeText={field.onChange} editable={!isSubmitting}/>}/>
        <Text style={styles.label}>Schedule</Text>
        <Controller name="frequency" control={control} render={({ field }) => <View style={styles.options}>
          {([{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Choose days' }, { value: 'weeklyTarget', label: 'Weekly target' }] as const).map(option =>
            <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: field.value === option.value, disabled: isSubmitting }}
              disabled={isSubmitting} onPress={() => field.onChange(option.value)} style={[styles.choice, field.value === option.value && styles.selected]}><Text style={styles.label}>{option.label}</Text></Pressable>)}
        </View>}/>
        {frequency === 'weekly' && <Controller name="weekdays" control={control} render={({ field }) => <View style={styles.options}>
          {days.map((day, index) => <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day}
            accessibilityState={{ checked: field.value.includes(index + 1), disabled: isSubmitting }} disabled={isSubmitting}
            onPress={() => field.onChange(field.value.includes(index + 1) ? field.value.filter(value => value !== index + 1) : [...field.value, index + 1])}
            style={[styles.choice, field.value.includes(index + 1) && styles.selected]}><Text style={styles.label}>{day}</Text></Pressable>)}
        </View>}/>}
        {frequency === 'weeklyTarget' && <><Text style={styles.meta}>Choose any days to reach your weekly target.</Text>
          <Controller name="target" control={control} render={({ field }) => <Field label="Times per week (1–7)" keyboardType="number-pad" value={field.value} onChangeText={field.onChange} editable={!isSubmitting}/>}/></>}
        <Text style={styles.label}>Category</Text><Controller name="category" control={control} render={({ field }) => <View style={styles.options}>
          {categorySchema.options.map(category => <Pressable key={category} accessibilityRole="radio" accessibilityLabel={category}
            accessibilityState={{ checked: field.value === category, disabled: isSubmitting }} disabled={isSubmitting}
            onPress={() => field.onChange(category)} style={[styles.choice, field.value === category && styles.selected]}><Text style={styles.label}>{category[0].toUpperCase() + category.slice(1)}</Text></Pressable>)}
        </View>}/>
        <Controller name="timeZone" control={control} render={({ field }) => <Field label="Goal time zone" value={field.value} onChangeText={field.onChange} autoCapitalize="none" autoCorrect={false} editable={!isSubmitting}/>}/>
        <Text style={styles.meta}>Scheduled days and completion dates follow this time zone.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button title={isSubmitting ? 'Saving…' : 'Save goal'} disabled={isSubmitting} onPress={() => { void submit(); }}/>
        <Button title="Cancel" tone="plain" disabled={isSubmitting} onPress={close}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 16, gap: 12 }, title: { fontSize: 26, fontWeight: '800', color: colors.ink }, label: { color: colors.ink, fontWeight: '700' }, meta: { color: colors.muted }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line }, selected: { backgroundColor: colors.sage, borderColor: colors.moss }, error: { color: colors.coral } });
