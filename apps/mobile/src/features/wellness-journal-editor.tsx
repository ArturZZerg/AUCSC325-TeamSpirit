import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveWellnessJournalSchema, wellnessJournalEntrySchema, wellnessJournalSchema } from '@campusflow/contracts';
import { ZodError } from 'zod';
import { Button, Field, colors } from '@/components/ui';
import { api } from '@/lib/api';
import { useSessionStore } from '@/store/session';
import type { useWellnessJournalAction } from '@/features/queries';
import { journalFields, matchesJournalDraft, ratingLabels, ratingLabel, type JournalEntry, type Rating } from './wellness-journal';

export function WellnessJournalEditor({ date, entry, action, onClose, onSaved }: {
  date: string; entry: JournalEntry | null; action: ReturnType<typeof useWellnessJournalAction>;
  onClose(): void; onSaved(entry: JournalEntry | null): void;
}) {
  const owner = useSessionStore(state => state.session);
  const [base, setBase] = useState(entry), [values, setValues] = useState(() => journalFields(entry));
  const [error, setError] = useState<string>(), [busy, setBusy] = useState(false), [discarding, setDiscarding] = useState(false);
  const [deleting, setDeleting] = useState(false), [latest, setLatest] = useState<{ entry: JournalEntry | null }>();
  const guard = useRef(false), attached = useRef(true), controller = useRef<AbortController | undefined>(undefined);
  const attempt = useRef<'save' | 'delete' | undefined>(undefined);
  const current = () => attached.current && !!owner && useSessionStore.getState().session?.user.id === owner.user.id
    && useSessionStore.getState().session?.accessToken === owner.accessToken;
  useEffect(() => { attached.current = true; return () => { attached.current = false; controller.current?.abort(); }; }, []);
  const disabled = busy || action.isPending;
  const close = () => {
    if (guard.current || action.isPending) return;
    if (JSON.stringify(values) !== JSON.stringify(journalFields(base))) setDiscarding(true); else onClose();
  };
  const run = async (kind: 'save' | 'delete') => {
    if (guard.current || action.isPending || !current()) return;
    guard.current = true; setBusy(true); setError(undefined); setLatest(undefined);
    let submitted = false;
    try {
      if (kind === 'delete') {
        if (!base) return;
        attempt.current = kind; submitted = true;
        const result = await action.mutateAsync({ path: `/wellness/journal/${date}`, method: 'DELETE', body: { expected: { id: base.id, revision: base.revision } } });
        if (!result || typeof result !== 'object' || !('deleted' in result) || result.deleted !== true) throw new Error('Unconfirmed deletion');
        if (current()) { onSaved(null); onClose(); }
      } else {
        const body = saveWellnessJournalSchema.parse({ ...values, note: values.note.trim() || null,
          expected: base ? { id: base.id, revision: base.revision } : null });
        attempt.current = kind; submitted = true;
        const saved = wellnessJournalEntrySchema.parse(await action.mutateAsync({ path: `/wellness/journal/${date}`, method: 'PUT', body }));
        if (saved.date !== date || !matchesJournalDraft(saved, values)
          || base && (saved.id !== base.id || saved.revision <= base.revision)) throw new Error('Unconfirmed save');
        if (current()) { onSaved(saved); onClose(); }
      }
    } catch (failure) {
      if (current()) setError(failure instanceof ZodError && !submitted ? failure.issues[0].message
        : 'Could not confirm your change. Your draft is kept. Check the saved entry before trying again.');
    } finally { guard.current = false; if (current()) setBusy(false); }
  };
  const reconcile = async () => {
    if (guard.current || !current() || !owner) return;
    guard.current = true; setBusy(true); controller.current = new AbortController();
    const deadline = setTimeout(() => controller.current?.abort(), 15_000);
    try {
      const result = wellnessJournalSchema.parse(await api(`/wellness/journal?from=${date}&through=${date}`,
        { cache: 'no-store', signal: controller.current.signal, headers: { Authorization: `Bearer ${owner.accessToken}` } }));
      if (!current()) return;
      if (result.accountId !== owner.user.id || result.timeZone !== owner.user.timeZone || result.from !== date || result.through !== date)
        throw new Error('Unconfirmed saved entry');
      const saved = result.entries[0] ?? null;
      if (attempt.current === 'delete' && !saved || attempt.current === 'save' && saved && matchesJournalDraft(saved, values)) {
        await action.confirmSaved();
        if (!current()) return;
        onSaved(saved); onClose(); return;
      }
      setLatest({ entry: saved }); setError(undefined);
    } catch { if (current()) setError('Saved entry is unavailable. Your draft and reviewed version are kept. Try checking again when connected.'); }
    finally { clearTimeout(deadline); guard.current = false; if (current()) setBusy(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{base ? 'Edit check-in' : 'New check-in'}</Text><Text style={styles.meta}>{date} · One entry for this day</Text>
        <Text style={styles.meta}>Record what feels useful. Every rating is optional.</Text>
        {(Object.keys(ratingLabels) as Rating[]).map(metric => <View key={metric} style={styles.group}>
          <Text style={styles.label}>{metric[0].toUpperCase() + metric.slice(1)}</Text>
          <View style={styles.choices}>{ratingLabels[metric].map((label, index) => <Pressable key={label} accessibilityRole="radio"
            accessibilityLabel={`${metric}, ${label}, ${index + 1} of 5`} aria-checked={values[metric] === index + 1} accessibilityState={{ checked: values[metric] === index + 1, disabled }}
            disabled={disabled} onPress={() => setValues(previous => ({ ...previous, [metric]: index + 1 }))}
            style={[styles.choice, values[metric] === index + 1 && styles.selected]}>
            <Text style={styles.choiceNumber}>{index + 1}</Text><Text style={styles.choiceLabel}>{label}</Text>
          </Pressable>)}</View>
          <Button title={`Clear ${metric}`} tone="plain" disabled={disabled || values[metric] === null} onPress={() => setValues(previous => ({ ...previous, [metric]: null }))}/>
        </View>)}
        <Field label="Private note (optional)" value={values.note} onChangeText={note => setValues(previous => ({ ...previous, note }))}
          multiline editable={!disabled} placeholder="What would help, or what would you like to remember?"/>
        <Text style={styles.meta}>{values.note.length}/2000 characters · Saved to your account when connected.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {attempt.current && <Button title={busy ? 'Checking or saving…' : 'Check saved entry'} tone="plain" disabled={disabled} onPress={() => { void reconcile(); }}/>}
        {latest && <View style={styles.review}><Text style={styles.label}>Latest saved version</Text>
          {latest.entry ? <><Text style={styles.meta}>Mood: {ratingLabel('mood', latest.entry.mood)} · Energy: {ratingLabel('energy', latest.entry.energy)} · Stress: {ratingLabel('stress', latest.entry.stress)}</Text>
            <Text>{latest.entry.note || 'No note recorded.'}</Text></> : <Text>No saved entry for this day.</Text>}
          <Text style={styles.meta}>Using this version replaces your unsaved draft. Review it before editing again.</Text>
          <Button title="Use saved version" tone="plain" disabled={disabled} onPress={() => { setBase(latest.entry); setValues(journalFields(latest.entry));
            setLatest(undefined); setDeleting(false); attempt.current = undefined; }}/>
        </View>}
        {deleting ? <View style={styles.review}><Text style={styles.label}>Delete this check-in?</Text><Text style={styles.meta}>Remove this day’s ratings and note from your account. Other offline copies can remain until refreshed.</Text>
          <Button title={busy ? 'Deleting…' : 'Confirm delete check-in'} tone="danger" disabled={disabled} onPress={() => { void run('delete'); }}/>
          <Button title="Keep check-in" tone="plain" disabled={disabled} onPress={() => setDeleting(false)}/></View>
          : <Button title={busy ? 'Saving…' : 'Save check-in'} disabled={disabled || !!latest} onPress={() => { void run('save'); }}/>}
        {base && !deleting && <Button title="Delete check-in" tone="danger" disabled={disabled} onPress={() => setDeleting(true)}/>}
        {discarding ? <View style={styles.review}><Text style={styles.label}>Discard your unsaved draft?</Text>
          <Button title="Keep editing" tone="plain" disabled={disabled} onPress={() => setDiscarding(false)}/>
          <Button title="Discard draft" tone="danger" disabled={disabled} onPress={onClose}/></View>
          : <Button title="Cancel check-in" tone="plain" disabled={disabled} onPress={close}/>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, gap: 16, width: '100%', maxWidth: 680, alignSelf: 'center', paddingBottom: 40 },
  title: { fontSize: 27, fontWeight: '800', color: colors.ink }, label: { fontWeight: '700', color: colors.ink }, meta: { color: colors.muted, lineHeight: 21 },
  group: { gap: 10 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 62, minWidth: 88, flexGrow: 1, flexBasis: 90,
    padding: 10, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', gap: 4 },
  selected: { backgroundColor: colors.sage, borderColor: colors.moss }, choiceNumber: { color: colors.moss, fontSize: 18, fontWeight: '800' }, choiceLabel: { color: colors.ink, textAlign: 'center' },
  review: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 12, backgroundColor: colors.card }, error: { color: colors.danger, lineHeight: 21 } });
