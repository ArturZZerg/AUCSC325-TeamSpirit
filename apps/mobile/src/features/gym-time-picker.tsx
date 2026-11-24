import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, colors } from '@/components/ui';
import { SheetModal } from '@/components/sheet-modal';
import { parseGymTime } from './gym-opening-hours-form';

export type GymTimePickerProps = { label: string; value: string; disabled: boolean; onChange(value: string): void };

/** Pick a wall-clock hour/minute; never convert this choice into a gym-zone instant. */
export function GymTimePicker({ label, value, disabled, onChange }: GymTimePickerProps) {
  const [open, setOpen] = useState(false);
  const clock = parseGymTime(value)?.time ?? '09:00';
  const [hour, minute] = clock.split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  const picker = <DateTimePicker accessibilityLabel={label} mode="time" value={date}
    disabled={disabled} is24Hour display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, selected) => {
      if (Platform.OS === 'android') setOpen(false);
      if (!disabled && event.type === 'set' && selected)
        onChange(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`);
    }}/>;
  return <View>
    <Button title="Choose time" accessibilityLabel={`Choose ${label.toLowerCase()}`} tone="plain" disabled={disabled} onPress={() => setOpen(true)}/>
    {open && (Platform.OS === 'ios' ? <SheetModal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.scrim}><View style={styles.dialog} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={styles.label}>{label}</Text>{picker}
        <Button title="Done" onPress={() => setOpen(false)}/>
      </View></View>
    </SheetModal> : picker)}
  </View>;
}
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.scrim },
  dialog: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 16, gap: 12, backgroundColor: colors.card, borderRadius: 18 },
  label: { color: colors.ink, fontSize: 16, fontWeight: '600' },
});
