import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { classScheduleFieldsSchema, validateClassPattern, type ClassSchedule } from '@campusflow/contracts';
import { addCalendarDays } from '@campusflow/domain';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';

export const classFormSchema = classScheduleFieldsSchema.extend({
  location: z.string().trim().max(240), instructor: z.string().trim().max(240), notes: z.string().trim().max(2000),
}).superRefine(validateClassPattern);
export type ClassFormValues = z.infer<typeof classFormSchema>;
export const classDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const classPalette = { moss: colors.moss, blue: colors.blue, plum: colors.plum, coral: colors.coral };

export function ClassEditor({ item, date, timeZone, onClose }: {
  item: ClassSchedule | null; date: string; timeZone: string; onClose(): void;
}) {
  const action = useAction(); const saving = useRef(false); const [message, setMessage] = useState<string>();
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema), defaultValues: {
      title: item?.title ?? '', weekdays: item?.weekdays ?? [1, 3, 5],
      termStart: item?.termStart ?? date, termEnd: item?.termEnd ?? addCalendarDays(date, 120),
      startTime: item?.startTime ?? '09:00', endTime: item?.endTime ?? '09:50', timeZone: item?.timeZone ?? timeZone,
      location: item?.location ?? '', instructor: item?.instructor ?? '', notes: item?.notes ?? '', color: item?.color ?? 'moss',
    },
  });
  const close = () => { if (!saving.current && !isSubmitting) onClose(); };
  const save = async (values: ClassFormValues) => {
    setMessage(undefined);
    try {
      await action.mutateAsync({ path: item ? `/classes/${item.id}` : '/classes', method: item ? 'PUT' : 'POST',
        body: { ...values, weekdays: [...values.weekdays].sort((a, b) => a - b),
          location: values.location || null, instructor: values.instructor || null, notes: values.notes || null } });
      onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this class. Please try again.'); }
  };
  const submit = async () => {
    if (saving.current) return;
    saving.current = true;
    try { await handleSubmit(save)(); } finally { saving.current = false; }
  };
  const error = Object.values(errors).find(value => value?.message)?.message ?? message;
  const input = (name: Exclude<keyof ClassFormValues, 'weekdays' | 'color'>, label: string, placeholder?: string) =>
    <Controller key={name} name={name} control={control} render={({ field }) =>
      <Field label={label} value={field.value} onChangeText={field.onChange} placeholder={placeholder}
        editable={!isSubmitting} autoCapitalize={name === 'timeZone' ? 'none' : undefined} autoCorrect={false} multiline={name === 'notes'}/>}/>;
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{item ? 'Edit class' : 'Add a class'}</Text>
        <Text style={styles.meta}>One meeting pattern per class. Add a separate entry for a lab or a different room.</Text>
        {input('title', 'Class name', 'e.g. Psychology 101 · Lecture')}
        <Text style={styles.label}>Meets on</Text>
        <Controller name="weekdays" control={control} render={({ field }) => <View style={styles.options}>
          {classDays.map((day, index) => <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day}
            aria-checked={field.value.includes(index + 1)}
            accessibilityState={{ checked: field.value.includes(index + 1), disabled: isSubmitting }} disabled={isSubmitting}
            onPress={() => field.onChange(field.value.includes(index + 1) ? field.value.filter(value => value !== index + 1) : [...field.value, index + 1])}
            style={[styles.choice, field.value.includes(index + 1) && styles.selected]}><Text style={styles.label}>{day.slice(0, 3)}</Text></Pressable>)}
        </View>}/>
        <View style={styles.row}><View style={styles.column}>{input('startTime', 'Starts (24h)', '09:00')}</View><View style={styles.column}>{input('endTime', 'Ends (24h)', '09:50')}</View></View>
        <View style={styles.row}><View style={styles.column}>{input('termStart', 'Term starts', 'YYYY-MM-DD')}</View><View style={styles.column}>{input('termEnd', 'Term ends', 'YYYY-MM-DD')}</View></View>
        {input('timeZone', 'Class time zone', 'America/Edmonton')}
        <Text style={styles.meta}>Dates and weekly times follow this zone. Holidays aren’t excluded automatically.</Text>
        {input('location', 'Room / location', 'e.g. Library 204')}{input('instructor', 'Instructor (optional)')}{input('notes', 'Notes (optional)')}
        <Text style={styles.label}>Class color</Text>
        <Controller name="color" control={control} render={({ field }) => <View style={styles.options}>
          {Object.entries(classPalette).map(([name, color]) => <Pressable key={name} accessibilityRole="radio" accessibilityLabel={`${name} class color`}
            aria-checked={field.value === name}
            accessibilityState={{ checked: field.value === name, disabled: isSubmitting }} disabled={isSubmitting}
            onPress={() => field.onChange(name)} style={[styles.choice, field.value === name && styles.selected]}>
            <View style={[styles.swatch, { backgroundColor: color }]}/><Text style={styles.label}>{name}</Text>
          </Pressable>)}
        </View>}/>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button title={isSubmitting ? 'Saving…' : 'Save class'} disabled={isSubmitting} onPress={() => { void submit(); }}/>
        <Button title="Cancel" tone="plain" disabled={isSubmitting} onPress={close}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, gap: 14, maxWidth: 680, width: '100%', alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 27, fontWeight: '800' }, meta: { color: colors.muted, lineHeight: 21 },
  label: { color: colors.ink, fontWeight: '700' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8 },
  selected: { borderColor: colors.moss, backgroundColor: colors.sage }, swatch: { width: 14, height: 14, borderRadius: 7 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, column: { flex: 1, minWidth: 125 }, error: { color: colors.coral },
});
