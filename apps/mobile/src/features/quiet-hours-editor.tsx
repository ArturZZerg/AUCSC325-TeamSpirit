import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { quietHoursFormSchema, quietHoursRequest, type QuietHoursForm } from '@/features/quiet-hours-form';
import type { NotificationPreferences } from '@/lib/types';

export function QuietHoursEditor({ preferences, timeZone, onClose }: { preferences: NotificationPreferences; timeZone: string; onClose(): void }) {
  const action = useAction(); const saving = useRef(false); const [message, setMessage] = useState<string>();
  const { control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<QuietHoursForm>({
    resolver: zodResolver(quietHoursFormSchema), defaultValues: { start: preferences.quietHoursStart ?? '', end: preferences.quietHoursEnd ?? '' },
  });
  const close = () => { if (!isSubmitting && !saving.current) onClose(); };
  const save = async (values: QuietHoursForm) => {
    setMessage(undefined);
    try { await action.mutateAsync(quietHoursRequest(values)); onClose(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save quiet hours. Please try again.'); }
  };
  const submit = async () => {
    if (saving.current) return;
    saving.current = true;
    try { await handleSubmit(save)(); } finally { saving.current = false; }
  };
  const error = errors.start?.message || errors.end?.message || message;
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Quiet hours</Text><Text style={styles.meta}>Times follow your account time zone: {timeZone}.</Text>
        <Text style={styles.meta}>Reminders during this interval are delayed until it ends. Use 24-hour times; an end earlier than the start means the next day.</Text>
        <Controller name="start" control={control} render={({ field }) => <Field label="Quiet hours start" placeholder="22:00" value={field.value} onChangeText={field.onChange} autoCorrect={false} editable={!isSubmitting}/>}/>
        <Controller name="end" control={control} render={({ field }) => <Field label="Quiet hours end" placeholder="07:00" value={field.value} onChangeText={field.onChange} autoCorrect={false} editable={!isSubmitting}/>}/>
        <Button title="Disable quiet hours" tone="plain" disabled={isSubmitting} onPress={() => {
          setValue('start', '', { shouldValidate: true }); setValue('end', '', { shouldValidate: true });
        }}/><Text style={styles.meta}>Leave both fields empty and save to turn quiet hours off.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button title={isSubmitting ? 'Saving…' : 'Save quiet hours'} disabled={isSubmitting} onPress={() => { void submit(); }}/>
        <Button title="Cancel" tone="plain" disabled={isSubmitting} onPress={close}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 16, gap: 12 }, title: { color: colors.ink, fontSize: 26, fontWeight: '800' }, meta: { color: colors.muted }, error: { color: colors.coral } });
