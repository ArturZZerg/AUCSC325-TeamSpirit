import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ZodError } from 'zod';
import { colors, design, typography } from '@/components/ui';
import { MotionPressable } from '@/components/motion';
import { useAction } from '@/features/queries';
import { parseQuickAdd } from './quick-add';
import { taskFormDefaults, taskFormRequest, type TaskFormValues } from './task-form';
import type { Course } from '@/lib/types';

/**
 * One-line capture: type, review the recognised details, press Add. Saving uses
 * the editor's request builder, so the same validation and account-zone
 * conversion apply. "Details" hands the parsed draft to the full editor.
 */
export function QuickAddBar({ today, planDate, timeZone, disabled, onOpenEditor, courses }: {
  today: string; planDate: string; timeZone: string; disabled?: boolean; onOpenEditor(values: Partial<TaskFormValues>): void; courses?: readonly Course[];
}) {
  const action = useAction();
  const saving = useRef(false);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'done'; text: string }>();
  const parsed = text.trim() ? parseQuickAdd(text, today, planDate, courses) : undefined;
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
    <View style={[styles.bar, focused && styles.barFocused]}>
      <Ionicons name="add-circle-outline" size={22} color={colors.moss}/>
      <TextInput accessibilityLabel="Quick add a task" value={text} onChangeText={value => { setText(value); setMessage(undefined); }}
        placeholder="Add something to your day…" placeholderTextColor={colors.muted} style={styles.input} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        editable={!disabled && !busy} returnKeyType="done" onSubmitEditing={() => { void add(); }} blurOnSubmit={false} maxLength={300}/>
      {!!text && <MotionPressable accessibilityRole="button" accessibilityLabel="Add" accessibilityState={{ disabled: !!disabled || busy }} disabled={disabled || busy}
        onPress={() => { void add(); }} style={({ hovered }) => [styles.add, hovered && styles.addHover, (disabled || busy) && styles.dim]}>
        {busy ? <ActivityIndicator size="small" color={design.signalInk}/> : <><Text style={styles.addText}>Add</Text><Ionicons name="arrow-up" size={16} color={design.signalInk}/></>}
      </MotionPressable>}
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
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, paddingLeft: 12, paddingRight: 6, borderRadius: 12, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line },
  barFocused: { borderColor: colors.moss, backgroundColor: colors.card },
  input: { ...typography, flex: 1, minWidth: 0, minHeight: 46, color: colors.ink, fontSize: 14, outlineColor: colors.moss, outlineWidth: 0 },
  add: { minWidth: 70, minHeight: 46, paddingHorizontal: 12, gap: 5, flexDirection: 'row', borderRadius: 10, backgroundColor: design.signal, alignItems: 'center', justifyContent: 'center' },
  addHover: { backgroundColor: '#BCE884' }, addText: { ...typography, color: design.signalInk, fontSize: 12, fontWeight: '700' }, dim: { opacity: 0.5 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  detail: { color: colors.moss, backgroundColor: colors.sage, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, overflow: 'hidden' },
  hint: { color: colors.muted, fontSize: 12, flexShrink: 1 }, more: { color: colors.moss, fontWeight: '800', fontSize: 13, marginLeft: 4 },
  error: { color: colors.coral, paddingHorizontal: 4 }, done: { color: colors.moss, paddingHorizontal: 4, fontWeight: '600' },
});
