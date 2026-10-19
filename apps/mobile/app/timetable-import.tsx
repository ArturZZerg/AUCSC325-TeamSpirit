import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ClassImportDraft, ClassImportPreview } from '@campusflow/contracts';
import { BackLink, Button, Card, Screen, State, colors } from '@/components/ui';
import { classDays, classPalette } from '@/features/class-editor';
import { useAction } from '@/features/queries';
import { ApiError } from '@/lib/api';
import { pickCalendarFile, previewCalendar } from '@/services/timetable-import';
import { useSessionStore } from '@/store/session';

type Status = 'saved' | 'failed' | 'rejected';
/** Only a lost connection or a server fault is worth retrying; a refused class needs a change first. */
const retryable = (error: unknown) => error instanceof TypeError || error instanceof ApiError && (error.status >= 500 || error.status === 408 || error.status === 429);
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

export default function TimetableImportScreen() {
  const session = useSessionStore(state => state.session);
  // A new account or session starts a fresh import; a preview never carries across accounts.
  return session ? <TimetableImport key={JSON.stringify([session.user.id, session.accessToken])}/> : null;
}

function TimetableImport() {
  const router = useRouter(); const action = useAction(); const busy = useRef(false);
  const [file, setFile] = useState<string>(); const [loading, setLoading] = useState(false); const [failure, setFailure] = useState<string>();
  const [preview, setPreview] = useState<ClassImportPreview>(); const [selected, setSelected] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<Record<number, Status>>({}); const [reasons, setReasons] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number>();

  const choose = async () => {
    if (busy.current) return;
    busy.current = true; setFailure(undefined);
    try {
      const picked = await pickCalendarFile();
      if (!picked) return;
      setLoading(true); setFile(picked.name); setPreview(undefined); setStatus({}); setReasons({});
      const result = await previewCalendar(picked.text);
      setPreview(result);
      setSelected(new Set(result.classes.flatMap((item, index) => item.duplicateOf ? [] : [index])));
    } catch (error) { setFailure(message(error, 'Couldn’t read this file. Try exporting the calendar again.')); }
    finally { busy.current = false; setLoading(false); }
  };

  const save = async () => {
    if (busy.current || !preview) return;
    busy.current = true; setFailure(undefined);
    try {
      for (const index of [...selected].sort((a, b) => a - b)) {
        if (status[index] === 'saved' || status[index] === 'rejected') continue;
        setSaving(index);
        const { meetings: _meetings, duplicateOf: _duplicate, ...fields } = preview.classes[index];
        try { await action.mutateAsync({ path: '/classes', method: 'POST', body: fields }); setStatus(value => ({ ...value, [index]: 'saved' })); }
        catch (error) {
          setStatus(value => ({ ...value, [index]: retryable(error) ? 'failed' : 'rejected' }));
          setReasons(value => ({ ...value, [index]: message(error, 'This class couldn’t be saved.') }));
        }
      }
    } finally { busy.current = false; setSaving(undefined); }
  };

  const toggle = (index: number) => setSelected(value => { const next = new Set(value); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  const chosen = [...selected].filter(index => status[index] !== 'saved' && status[index] !== 'rejected');
  const rejectedCount = [...selected].filter(index => status[index] === 'rejected').length;
  const savedCount = Object.values(status).filter(value => value === 'saved').length;
  const failedCount = [...selected].filter(index => status[index] === 'failed').length;
  const done = !!preview && savedCount > 0 && chosen.length === 0;
  const working = loading || saving !== undefined;

  return <Screen safeArea><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.heading}><BackLink to="Timetable" disabled={saving !== undefined} onPress={() => router.replace('/timetable')}/><Text style={styles.kicker}>IMPORT CLASSES</Text></View>
    <View style={styles.hero}><Ionicons name="calendar-outline" size={28} color={colors.moss}/>
      <Text style={styles.title}>Bring your schedule in.</Text>
      <Text style={styles.copy}>Choose a calendar file (.ics) exported from your class schedule, Google Calendar, Outlook or Apple Calendar. CampusFlow finds your weekly classes and lets you pick which to add. Nothing is saved until you confirm.</Text></View>
    <Button title={preview ? 'Choose another file' : 'Choose a calendar file'} tone={preview ? 'plain' : 'primary'} disabled={working} onPress={() => { void choose(); }}/>
    {loading && <State loading/>}
    {failure && <Card><Text accessibilityRole="alert" style={styles.warning}>{failure}</Text></Card>}
    {preview && !loading && <>
      <Text style={styles.section}>{preview.classes.length ? `${preview.classes.length} weekly ${preview.classes.length === 1 ? 'class' : 'classes'} found` : 'No weekly classes found'}</Text>
      {file && <Text style={styles.meta}>From {file} · times in your account time zone</Text>}
      <Skipped preview={preview}/>
      {!preview.classes.length && <Text style={styles.copy}>Classes need to repeat at least twice at the same time and place. Check that you exported your class schedule, not a single event, then choose the file again.</Text>}
      {preview.classes.map((item, index) => <Draft key={index} item={item} checked={selected.has(index)} status={status[index]} reason={reasons[index]}
        saving={saving === index} disabled={working || status[index] === 'saved' || status[index] === 'rejected'} onToggle={() => toggle(index)}/>)}
      {done ? <Card>
        <Text style={styles.item}>{savedCount} {savedCount === 1 ? 'class' : 'classes'} added to your timetable.</Text>
        {rejectedCount > 0 && <Text style={styles.copy}>{rejectedCount} couldn’t be added as imported. Add {rejectedCount === 1 ? 'it' : 'them'} from the timetable instead.</Text>}
        <Button title="Open timetable" onPress={() => router.replace('/timetable')}/>
      </Card> : preview.classes.length > 0 && <>
        {failedCount > 0 && <Text accessibilityRole="alert" style={styles.warning}>{failedCount} {failedCount === 1 ? 'class' : 'classes'} couldn’t be saved. Your other classes are saved. Check your connection and try again.</Text>}
        <Button title={saving !== undefined ? 'Saving classes…' : failedCount ? `Retry ${chosen.length} ${chosen.length === 1 ? 'class' : 'classes'}` : `Add ${chosen.length} ${chosen.length === 1 ? 'class' : 'classes'}`}
          disabled={working || chosen.length === 0} onPress={() => { void save(); }}/>
      </>}
    </>}
    {!preview && !loading && <Text style={styles.meta}>Tip: in Google Calendar, use Settings → Import & export → Export. CampusFlow never asks for your university password.</Text>}
  </ScrollView></Screen>;
}

function Skipped({ preview }: { preview: ClassImportPreview }) {
  const { oneTime, allDay, unsupported, finished, overLimit } = preview.skipped;
  const parts = [oneTime && `${oneTime} one-time ${oneTime === 1 ? 'event' : 'events'}`, allDay && `${allDay} all-day or open-ended`,
    finished && `${finished} already finished`, unsupported && `${unsupported} unreadable, untitled or overnight`,
    overLimit && `${overLimit} more ${overLimit === 1 ? 'class' : 'classes'} beyond the first 40`].filter(Boolean);
  return parts.length ? <Text style={styles.meta}>Skipped: {parts.join(' · ')}.</Text> : null;
}

function Draft({ item, checked, status, reason, saving, disabled, onToggle }: { item: ClassImportDraft; checked: boolean; status?: Status; reason?: string; saving: boolean; disabled: boolean; onToggle(): void }) {
  const days = item.weekdays.map(day => classDays[day - 1].slice(0, 3)).join(' · ');
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} aria-checked={checked}
    accessibilityLabel={`${item.title}, ${days}, ${item.startTime} to ${item.endTime}${item.duplicateOf ? ', already in your timetable' : ''}`}
    disabled={disabled} onPress={onToggle} style={[styles.draft, { borderLeftColor: classPalette[item.color] }, checked && styles.checked]}>
    <View style={styles.row}>
      <Ionicons name={status === 'saved' ? 'checkmark-circle' : checked ? 'checkbox' : 'square-outline'} size={22} color={status === 'saved' ? colors.moss : checked ? colors.moss : colors.muted}/>
      <Text style={[styles.item, styles.grow]}>{item.title}</Text>
    </View>
    <Text style={styles.copy}>{days} · {item.startTime}–{item.endTime}</Text>
    <Text style={styles.meta}>{item.location ?? 'Room not set'} · {item.termStart} to {item.termEnd} · {item.meetings} meetings</Text>
    {item.duplicateOf && status !== 'saved' && <Text style={styles.note}>Looks like a class already in your timetable.</Text>}
    {saving && <Text style={styles.note}>Saving…</Text>}
    {status === 'saved' && <Text style={styles.done}>Added</Text>}
    {status === 'failed' && <Text style={styles.warning}>Not saved yet</Text>}
    {status === 'rejected' && <Text style={styles.warning}>Not added: {reason}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hero: { paddingVertical: 10, gap: 12 }, kicker: { color: colors.moss, fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: colors.ink }, section: { fontSize: 20, fontWeight: '800', color: colors.ink },
  copy: { color: colors.muted, lineHeight: 22 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  item: { fontSize: 17, color: colors.ink, fontWeight: '700' }, warning: { color: colors.coral, lineHeight: 21 },
  note: { color: colors.muted, fontStyle: 'italic', lineHeight: 20 }, done: { color: colors.moss, fontWeight: '700' },
  draft: { padding: 16, gap: 8, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, minHeight: 48 },
  checked: { borderColor: colors.moss }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, grow: { flex: 1 },
});
