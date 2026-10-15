import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ZodError } from 'zod';
import { colors } from '@/components/ui';
import { useAction } from '@/features/queries';
import { parseQuickAdd } from './quick-add';
import { taskFormDefaults, taskFormRequest, type TaskFormValues } from './task-form';

/**
 * One-line capture: type, review the recognised details, press Add. Saving uses
 * the editor's request builder, so the same validation and account-zone
 * conversion apply. "Details" hands the parsed draft to the full editor.
 */
export function QuickAddBar({ today, planDate, timeZone, disabled, onOpenEditor }: {
  today: string; planDate: string; timeZone: string; disabled?: boolean; onOpenEditor(values: Partial<TaskFormValues>): void;
}) {
  const action = useAction();
  const saving = useRef(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'done'; text: string }>();
  const parsed = text.trim() ? parseQuickAdd(text, today, planDate) : undefined;
  const busy = action.isPending || saving.current;
  const add = async () => {
    if (disabled || !parsed || saving.current || action.isPending) return;
    saving.current = true; setMessage(undefined);
    try {
      await action.mutateAsync(taskFormRequest({ ...taskFormDefaults(null, timeZone), ...parsed.values } as TaskFormValues, null, timeZone));
      setText(''); setMessage({ tone: 'done', text: `Added “${parsed.title}”.` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof ZodError ? error.issues[0].message
        : error instanceof TypeError ? 'Couldn’t confirm the save. Check your connection and tasks before retrying.'
          : error instanceof Error ? error.message : 'Could not add the task. Please try again.' });
    } finally { saving.current = false; }
  };
  return <View style={styles.wrap}>
    <View style={styles.bar}>
      <Ionicons name="add-circle-outline" size={22} color={colors.moss}/>
      <TextInput accessibilityLabel="Quick add a task" value={text} onChangeText={value => { setText(value); setMessage(undefined); }}
        placeholder="Quick add: Essay due fri 5pm #uni !high" placeholderTextColor={colors.muted} style={styles.input}
        editable={!disabled && !busy} returnKeyType="done" onSubmitEditing={() => { void add(); }} blurOnSubmit={false} maxLength={300}/>
      {!!text && <Pressable accessibilityRole="button" accessibilityLabel="Add" accessibilityState={{ disabled: !!disabled || busy }} disabled={disabled || busy}
        onPress={() => { void add(); }} style={[styles.add, (disabled || busy) && styles.dim]}>
        {busy ? <ActivityIndicator size="small" color={colors.onAccent}/> : <Ionicons name="arrow-up" size={18} color={colors.onAccent}/>}
      </Pressable>}
    </View>
    {parsed && <View style={styles.preview}>
      {parsed.details.map(detail => <Text key={detail} style={styles.detail}>{detail}</Text>)}
      {!parsed.details.length && <Text style={styles.hint}>Planned for this day · add a day, time, #tag, !priority or 30m</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel="Open quick add in the full editor" disabled={disabled || busy}
        onPress={() => { onOpenEditor(parsed.values); setText(''); }} hitSlop={6}><Text style={styles.more}>Details</Text></Pressable>
    </View>}
    {message && <Text accessibilityRole="alert" style={message.tone === 'error' ? styles.error : styles.done}>{message.text}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, paddingLeft: 12, paddingRight: 6, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  input: { flex: 1, minHeight: 46, color: colors.ink, fontSize: 15 },
  add: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' }, dim: { opacity: 0.5 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  detail: { color: colors.moss, backgroundColor: colors.sage, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, overflow: 'hidden' },
  hint: { color: colors.muted, fontSize: 12, flexShrink: 1 }, more: { color: colors.moss, fontWeight: '800', fontSize: 13, marginLeft: 4 },
  error: { color: colors.coral, paddingHorizontal: 4 }, done: { color: colors.moss, paddingHorizontal: 4, fontWeight: '600' },
});
