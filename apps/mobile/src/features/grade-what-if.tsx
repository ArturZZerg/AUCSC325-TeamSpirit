import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { whatIfScoreMax, whatIfSummary, type Assessment, type WhatIfSummary } from '@campusflow/domain';
import { colors } from '@/components/ui';
import { percentInput } from '@/features/assessment-editor';

const pct = (value: number | null) => value === null ? '—' : `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
const usable = (text: string | undefined) => {
  const value = percentInput(text ?? '');
  return value !== null && Number.isFinite(value) && value >= 0 && value <= whatIfScoreMax ? value : null;
};

/** What the hypothetical scores mean for the course, in one or two sentences. */
export function whatIfOutcome(summary: WhatIfSummary, target: number | null): string {
  if (!summary.tried) return 'Type a score for any ungraded assessment to see where you’d land.';
  if (summary.status === 'final') {
    const final = summary.floor ?? 0;
    const verdict = target === null ? '' : final >= target ? ` That meets your ${target}% target.` : ` That’s ${pct(Math.round((target - final) * 10) / 10)} short of your ${target}% target.`;
    return `Your final grade would be ${pct(final)}.${verdict}`;
  }
  const sofar = `Your grade so far would be ${pct(summary.current)}.`;
  if (summary.status === 'secured') return `${sofar} Your ${target}% target would be secured, even with 0% on the remaining ${pct(summary.remainingWeight)}.`;
  if (summary.status === 'unreachable') return `${sofar} Your ${target}% target would be out of reach: 100% on the rest gives ${pct(summary.ceiling)}.`;
  if (summary.status === 'reachable') return `${sofar} You’d then need an average of ${pct(summary.needed)} on the remaining ${pct(summary.remainingWeight)}.`;
  return `${sofar} You’d finish between ${pct(summary.floor)} and ${pct(summary.ceiling)}.`;
}

/**
 * Try hypothetical scores on ungraded assessments. Nothing here is saved: the
 * entries live only on this screen and recorded scores are never changed.
 */
export function GradeWhatIf({ assessments, target }: { assessments: readonly Assessment[]; target: number | null }) {
  const [entries, setEntries] = useState<Record<string, string>>({});
  const open = useMemo(() => assessments.filter(row => row.score === null), [assessments]);
  const scores = useMemo(() => Object.fromEntries(open.flatMap(row => { const value = usable(entries[row.id]); return value === null ? [] : [[row.id, value]]; })), [open, entries]);
  const summary = useMemo(() => whatIfSummary(assessments, scores, target), [assessments, scores, target]);
  if (!open.length) return null;
  const blanks = open.filter(row => usable(entries[row.id]) === null);
  // Filling every untried row with the average still needed lands on the target.
  const fill = summary.status === 'reachable' && summary.needed !== null && blanks.length > 0 ? summary.needed : null;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.section}>What if…</Text>
    <Text style={styles.meta}>Try scores for work that isn’t graded yet. Nothing here is saved.</Text>
    {open.map(row => {
      const text = entries[row.id] ?? '', invalid = !!text.trim() && usable(text) === null;
      return <View key={row.id} style={styles.row}>
        <View style={styles.body}><Text style={styles.item}>{row.title}</Text><Text style={styles.meta}>Weight {pct(row.weight)}</Text>
          {invalid && <Text style={styles.error}>Enter 0 to {whatIfScoreMax}.</Text>}</View>
        <TextInput accessibilityLabel={`What-if score for ${row.title} (%)`} accessibilityHint="Not saved" value={text} placeholder="—" placeholderTextColor={colors.muted}
          onChangeText={value => setEntries(current => ({ ...current, [row.id]: value }))} keyboardType="decimal-pad" maxLength={6}
          style={[styles.input, invalid && styles.invalid]}/>
      </View>;
    })}
    <Text accessibilityLiveRegion="polite" style={styles.outcome}>{whatIfOutcome(summary, target)}</Text>
    <View style={styles.actions}>
      {fill !== null && <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEntries(current => ({ ...current, ...Object.fromEntries(blanks.map(row => [row.id, String(fill)])) }))}>
        <Text style={styles.link}>Fill the rest with {pct(fill)}</Text></Pressable>}
      {Object.values(entries).some(value => value.trim()) && <Pressable accessibilityRole="button" accessibilityLabel="Clear what-if scores" hitSlop={8} onPress={() => setEntries({})}>
        <Text style={styles.link}>Clear</Text></Pressable>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
  section: { color: colors.ink, fontSize: 18, fontWeight: '800' }, meta: { color: colors.muted, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, body: { flex: 1, gap: 2 }, item: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  input: { width: 84, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line,
    color: colors.ink, fontSize: 16, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  invalid: { borderColor: colors.coral }, error: { color: colors.coral, fontSize: 13 },
  outcome: { color: colors.ink, fontWeight: '700', lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }, link: { color: colors.moss, fontWeight: '800', fontSize: 15 },
});
