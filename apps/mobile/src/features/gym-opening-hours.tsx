import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GymOpeningDay, GymOpeningHours } from '@campusflow/contracts';
import { Button, Card, Field, colors } from '@/components/ui';
import { gymClosesNextDay, newGymHours, validateGymHours } from './gym-opening-hours-form';
import { GymTimePicker } from './gym-time-picker';

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function gymOpeningDayLabel(day: GymOpeningDay) {
  return day.kind === 'closed' ? 'Closed' : day.kind === 'unknown' ? 'Hours not set'
    : `${day.opens}–${day.closes}${gymClosesNextDay(day.opens, day.closes) ? ' (next day)' : ''}`;
}

export function GymOpeningHoursCard({ hours, timeZone, onSave }: {
  hours: GymOpeningHours | null | undefined; timeZone: string;
  onSave(hours: GymOpeningHours | null): Promise<unknown>;
}) {
  const [draft, setDraft] = useState<GymOpeningHours>();
  // Keep a confirmed save visible if the following overview refresh fails.
  // A new server snapshot takes precedence; the owning screen keys this card by session.
  const [confirmed, setConfirmed] = useState<{ source: typeof hours; value: GymOpeningHours | null }>();
  const displayed = confirmed && confirmed.source === hours ? confirmed.value : hours;
  const [pending, setPending] = useState(false), [message, setMessage] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const edit = () => {
    setMessage(undefined); setErrors({});
    setDraft(displayed ?? newGymHours(timeZone));
  };
  const changeDay = (index: number, day: GymOpeningDay) => {
    setErrors(old => Object.fromEntries(Object.entries(old).filter(([key]) => !key.startsWith(`days.${index}.`))));
    setDraft(value => value && ({ ...value, days: value.days.map((old, i) => i === index ? day : old) }));
  };
  const save = async (value: GymOpeningHours | null) => {
    if (pending) return;
    setMessage(undefined); setErrors({});
    if (value) {
      const parsed = validateGymHours(value);
      if (!parsed.success) { setErrors(parsed.errors); return; }
      value = parsed.data; setDraft(value);
    }
    setPending(true);
    try { await onSave(value); setConfirmed({ source: hours, value }); setDraft(undefined); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save gym hours. Please retry.'); }
    finally { setPending(false); }
  };
  return <Card>
    <Text accessibilityRole="header" style={styles.title}>Gym opening hours</Text>
    {!draft ? <>
      {displayed ? <><Text style={styles.meta}>{displayed.timeZone} · 24-hour time</Text>
        {displayed.days.map((day, index) => <Text key={dayNames[index]} style={styles.meta}>{dayNames[index]}: {gymOpeningDayLabel(day)}</Text>)}</>
        : <Text style={styles.meta}>Gym hours haven’t been set.</Text>}
      <Button title={displayed ? 'Edit gym hours' : 'Set gym hours'} tone="plain" onPress={edit}/>
    </> : <>
      <Text style={styles.meta}>Type a time (7:00, 7 AM or 7:30pm) or use the time picker. Closing before opening means the next day. Closed days have no new opening; an overnight opening from the previous day can continue.</Text>
      <Field label="Gym timezone" value={draft.timeZone} editable={!pending} onChangeText={value => { setErrors(old => ({ ...old, timeZone: '' })); setDraft({ ...draft, timeZone: value }); }}/>
      {errors.timeZone && <Text accessibilityRole="alert" style={styles.error}>Gym timezone: {errors.timeZone}</Text>}
      {draft.days.map((day, index) => <View key={dayNames[index]} style={styles.day}>
        <Text style={styles.title}>{dayNames[index]}</Text>
        <View style={styles.options}>{(['unknown', 'closed', 'open'] as const).map(kind => <Pressable key={kind} accessibilityRole="radio"
          accessibilityLabel={`${dayNames[index]} ${kind === 'unknown' ? 'hours not set' : kind}`} accessibilityState={{ selected: day.kind === kind, disabled: pending }} disabled={pending}
          onPress={() => { if (day.kind !== kind) changeDay(index, kind === 'open' ? { kind, opens: '09:00', closes: '17:00' } : { kind }); }}
          style={[styles.option, day.kind === kind && styles.selected]}><Text style={styles.meta}>{kind === 'unknown' ? 'Not set' : kind === 'closed' ? 'Closed' : 'Open'}</Text></Pressable>)}</View>
        {day.kind === 'open' && <>
          <Field label={`${dayNames[index]} opens`} value={day.opens} placeholder="09:00" editable={!pending} autoCapitalize="none" autoCorrect={false} onChangeText={opens => changeDay(index, { ...day, opens })}
            accessory={<GymTimePicker label={`${dayNames[index]} opens`} value={day.opens} disabled={pending} onChange={opens => changeDay(index, { ...day, opens })}/>}/>
          {errors[`days.${index}.opens`] && <Text accessibilityRole="alert" style={styles.error}>{dayNames[index]} opening time: {errors[`days.${index}.opens`]}</Text>}
          <Field label={`${dayNames[index]} closes`} value={day.closes} placeholder="17:00" editable={!pending} autoCapitalize="none" autoCorrect={false} onChangeText={closes => changeDay(index, { ...day, closes })}
            accessory={<GymTimePicker label={`${dayNames[index]} closes`} value={day.closes} disabled={pending} onChange={closes => changeDay(index, { ...day, closes })}/>}/>
          {errors[`days.${index}.closes`] && <Text accessibilityRole="alert" style={styles.error}>{dayNames[index]} closing time: {errors[`days.${index}.closes`]}</Text>}
          {gymClosesNextDay(day.opens, day.closes) && <Text style={styles.meta}>Closes the next day.</Text>}
        </>}
      </View>)}
      <Button title={pending ? 'Saving…' : 'Save gym hours'} disabled={pending} onPress={() => { void save(draft); }}/>
      <Button title="Remove saved hours" tone="plain" disabled={pending} onPress={() => { void save(null); }}/>
      <Button title="Cancel" tone="plain" disabled={pending} onPress={() => { setDraft(undefined); setMessage(undefined); }}/>
    </>}
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
  </Card>;
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 16, fontWeight: '700' }, meta: { color: colors.muted, lineHeight: 21 },
  error: { color: colors.danger }, day: { gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.sage, borderColor: colors.moss },
});
