import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/components/ui';
import { courseColor } from './course-editor';
import { countdownLabel, type UpcomingExam } from './exams';

/** Today's heads-up for exams in the next two weeks; links to Coursework for study planning. */
export function ExamCountdown({ exams }: { exams: UpcomingExam[] }) {
  if (!exams.length) return null;
  const clock = (time: string) => new Date(`2000-01-01T${time}:00Z`).toLocaleTimeString([], { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
  return <View style={styles.card}>
    <View style={styles.heading}><Ionicons name="school" size={18} color={colors.coral}/><Text accessibilityRole="header" style={styles.title}>Exams ahead</Text></View>
    {exams.slice(0, 3).map(exam => <Pressable key={exam.id} accessibilityRole="button"
      accessibilityLabel={`${exam.title}${exam.course ? `, ${exam.course.code ?? exam.course.name}` : ''}, ${countdownLabel(exam.daysLeft).toLowerCase()}. Plan study in Coursework`}
      onPress={() => router.push('/academics')} style={({ pressed }) => [styles.exam, pressed && styles.pressed]}>
      <View style={[styles.days, exam.daysLeft <= 2 && styles.soon]}>
        <Text style={[styles.daysValue, exam.daysLeft <= 2 && styles.soonText]}>{exam.daysLeft === 0 ? '!' : exam.daysLeft}</Text>
        <Text style={[styles.daysLabel, exam.daysLeft <= 2 && styles.soonText]}>{exam.daysLeft === 0 ? 'today' : exam.daysLeft === 1 ? 'day' : 'days'}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{exam.title}</Text>
        <Text style={styles.meta}>{[exam.course ? exam.course.code ?? exam.course.name : null, countdownLabel(exam.daysLeft),
          new Date(`${exam.date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }) + (exam.time ? `, ${clock(exam.time)}` : '')]
          .filter(Boolean).join(' · ')}</Text>
      </View>
      {exam.course && <View style={[styles.dot, { backgroundColor: courseColor(exam.course) }]}/>}
    </Pressable>)}
    {exams.length > 3 && <Text style={styles.meta}>+{exams.length - 3} more in the next two weeks</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  exam: { flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed: { opacity: 0.7 },
  days: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  soon: { backgroundColor: colors.coral }, daysValue: { color: colors.ink, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  daysLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }, soonText: { color: colors.onAccent },
  body: { flex: 1, gap: 2 }, name: { color: colors.ink, fontSize: 15, fontWeight: '700' }, meta: { color: colors.muted, fontSize: 13 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
