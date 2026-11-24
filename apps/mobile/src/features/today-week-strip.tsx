import Ionicons from '@expo/vector-icons/Ionicons';
import { addCalendarDays } from '@campusflow/domain';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors, design, typography } from '@/components/ui';
import { MotionPressable } from '@/components/motion';

/** Calendar dates stay in the account calendar, including across DST changes. */
export function TodayWeekStrip({ date, today }: { date: string; today: string }) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  const monday = addCalendarDays(date, 1 - weekday);
  const open = (selected: string) => router.push({ pathname: '/today', params: { date: selected } });
  return <View style={styles.card}>
    <View style={styles.heading}>
      <Text style={styles.month}>{new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' })}</Text>
      <View style={styles.arrows}>
        <MotionPressable lift={0} accessibilityRole="button" accessibilityLabel="Previous week" onPress={() => open(addCalendarDays(date, -7))} style={({ hovered }) => [styles.arrow, hovered && styles.hover]}>
          <Ionicons name="chevron-back" size={16} color={colors.muted}/>
        </MotionPressable>
        <MotionPressable lift={0} accessibilityRole="button" accessibilityLabel="Next week" onPress={() => open(addCalendarDays(date, 7))} style={({ hovered }) => [styles.arrow, hovered && styles.hover]}>
          <Ionicons name="chevron-forward" size={16} color={colors.muted}/>
        </MotionPressable>
      </View>
    </View>
    <View style={styles.days}>
      {Array.from({ length: 7 }, (_, index) => {
        const day = addCalendarDays(monday, index), selected = day === date;
        const value = new Date(`${day}T12:00:00Z`);
        return <MotionPressable key={day} lift={1} accessibilityRole="button" accessibilityLabel={`View ${value.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' })}`}
          accessibilityState={{ selected }} onPress={() => open(day)} style={({ hovered }) => [styles.day, hovered && !selected && styles.hover, selected && styles.selected]}>
          <Text style={[styles.dayName, selected && styles.onAccent]}>{value.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'narrow' })}</Text>
          <Text style={[styles.number, selected && styles.onAccent]}>{value.getUTCDate()}</Text>
          <View style={[styles.dot, day === today && { backgroundColor: selected ? design.signalInk : colors.moss }]}/>
        </MotionPressable>;
      })}
    </View>
    {date !== today && <MotionPressable lift={0} accessibilityRole="button" onPress={() => open(today)} style={styles.return}><Text style={styles.returnText}>Back to today</Text><Ionicons name="arrow-forward" size={14} color={colors.moss}/></MotionPressable>}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 20, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.line, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { ...typography, color: colors.ink, fontSize: 15, fontWeight: '600' },
  arrows: { flexDirection: 'row' }, arrow: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', gap: 3 }, day: { flex: 1, minHeight: 78, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 9 },
  selected: { backgroundColor: design.signal }, hover: { backgroundColor: colors.sage }, dayName: { ...typography, color: colors.muted, fontSize: 11, fontWeight: '500' },
  number: { ...typography, color: colors.ink, fontSize: 15, fontWeight: '600' }, onAccent: { color: design.signalInk },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  return: { minHeight: 46, flexDirection: 'row', gap: 8, alignItems: 'center' }, returnText: { ...typography, color: colors.moss, fontSize: 13, fontWeight: '600' },
});
