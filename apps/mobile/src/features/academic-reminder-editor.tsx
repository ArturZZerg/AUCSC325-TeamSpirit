import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, State, colors } from '@/components/ui';
import { useAcademicReminder, useAction } from '@/features/queries';
import type { AcademicItem } from '@/lib/types';

const options = [
  { value: null, label: 'No reminder' }, { value: 0, label: 'At the deadline' },
  { value: 60, label: '1 hour before' }, { value: 1440, label: '1 day before' }, { value: 2880, label: '2 days before' },
];
export function AcademicReminderEditor({ item, onClose }: { item: AcademicItem; onClose(): void }) {
  const query = useAcademicReminder(item.id);
  const action = useAction();
  const [choice, setChoice] = useState<{ value: number | null }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const value = choice ? choice.value : query.data?.leadMinutes;
  const disabled = saving || action.isPending;
  const close = () => { if (!busy.current && !disabled) onClose(); };
  const save = async () => {
    if (busy.current || disabled || value === undefined || !query.data) return;
    busy.current = true; setSaving(true); setError(undefined);
    try {
      await action.mutateAsync({ path: `/academic-items/${item.id}/reminder`, method: 'PUT', body: { leadMinutes: value } });
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the reminder. Try again.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Coursework reminder</Text><Text style={styles.subject}>{item.title}</Text>
      <Text style={styles.meta}>Choose how far ahead you’d like a reminder. It follows a changed deadline after your next successful sync.</Text>
      <State loading={query.isLoading} error={query.error}/>
      {query.error && <Button title="Retry loading" tone="plain" disabled={disabled} onPress={() => { void query.refetch(); }}/>}
      {query.data && <View style={styles.options}>
        {options.map(option => <Pressable key={String(option.value)} accessibilityRole="radio" accessibilityLabel={option.label}
          accessibilityState={{ checked: value === option.value, disabled }} disabled={disabled}
          onPress={() => setChoice({ value: option.value })} style={[styles.option, value === option.value && styles.selected]}><Text style={styles.subject}>{option.label}</Text></Pressable>)}
        {value !== undefined && !options.some(option => option.value === value) && <Text style={styles.meta}>Current reminder: {value} minutes before. Save to keep it, or choose a new option.</Text>}
      </View>}
      {item.due?.kind !== 'instant' && <Text style={styles.notice}>This item has no timed deadline. Your preference is saved, and delivery becomes available when a timed deadline is imported.</Text>}
      {(item.submissionState === 'submitted' || item.submissionState === 'graded') && <Text style={styles.notice}>Finished coursework does not send reminders.</Text>}
      <Text style={styles.meta}>Device notification permission, academic notification preferences and quiet hours apply. Past reminder times are not delivered.</Text>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Button title={disabled ? 'Saving…' : 'Save reminder'} disabled={disabled || value === undefined || !query.data} onPress={() => { void save(); }}/>
      <Button title="Cancel" tone="plain" disabled={disabled} onPress={close}/>
    </ScrollView>
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' }, subject: { color: colors.ink, fontWeight: '700' },
  meta: { color: colors.muted, lineHeight: 21 }, notice: { color: colors.ink, lineHeight: 21, backgroundColor: colors.sage, padding: 12, borderRadius: 12 },
  options: { gap: 8 }, option: { minHeight: 48, justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
  selected: { backgroundColor: colors.sage, borderColor: colors.moss }, error: { color: colors.coral },
});
