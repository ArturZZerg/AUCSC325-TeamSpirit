import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { estimateProgramMinutes, type GymAudience, type GymLevel, type GymProgram, type GymSetting } from '@campusflow/domain';
import { colors } from '@/components/ui';
import { audienceLabels, filterPrograms, goalLabels, levelLabels, levelText, settingLabels, type ProgramFilters } from './gym';

type IconName = ComponentProps<typeof Ionicons>['name'];
const settingIcons: Record<GymSetting, IconName> = { gym: 'barbell-outline', dumbbells: 'fitness-outline', none: 'home-outline' };
const levels: GymLevel[] = ['beginner', 'intermediate', 'advanced'];
const audiences: GymAudience[] = ['women', 'men'];
const settings: GymSetting[] = ['gym', 'dumbbells', 'none'];

function Choice<T extends string>({ label, all, value, options, labels, onChange }: { label: string; all: string; value?: T; options: T[]; labels: Record<T, string>; onChange(value?: T): void }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.choices}>
    {[undefined, ...options].map(option => { const selected = value === option;
      return <Pressable key={option ?? 'all'} accessibilityRole="radio" accessibilityLabel={option ? labels[option] : all} accessibilityState={{ checked: selected }}
        onPress={() => onChange(option)} style={[styles.chip, selected && styles.selected]}>
        <Text style={[styles.chipText, selected && styles.selectedText]}>{option ? labels[option] : all}</Text></Pressable>; })}
  </View>;
}

export function ProgramCard({ program, current, onPress }: { program: GymProgram; current?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${program.name}, ${levelText(program)}, ${program.daysPerWeek} days a week`} onPress={onPress}
    style={({ pressed }) => [styles.card, current && styles.currentCard, pressed && styles.pressed]}>
    <View style={styles.cardTop}>
      <View style={styles.icon}><Ionicons name={settingIcons[program.setting]} size={22} color={colors.moss}/></View>
      <View style={styles.cardTitle}>
        <Text style={styles.kicker}>{levelText(program).toUpperCase()}{program.audience !== 'everyone' ? ` · ${audienceLabels[program.audience].toUpperCase()}` : ''}</Text>
        <Text style={styles.name}>{program.name}</Text>
      </View>
      {current ? <View style={styles.badge}><Text style={styles.badgeText}>Current</Text></View> : <Ionicons name="chevron-forward" size={20} color={colors.muted}/>}
    </View>
    <Text style={styles.tagline}>{program.tagline}</Text>
    <View style={styles.facts}>
      <Fact icon="calendar-outline" text={`${program.daysPerWeek}× / week`}/><Fact icon="time-outline" text={`~${estimateProgramMinutes(program)} min`}/>
      <Fact icon="flag-outline" text={goalLabels[program.goal]}/><Fact icon={settingIcons[program.setting]} text={settingLabels[program.setting]}/>
    </View>
  </Pressable>;
}
const Fact = ({ icon, text }: { icon: IconName; text: string }) => <View style={styles.fact}><Ionicons name={icon} size={14} color={colors.muted}/><Text style={styles.factText}>{text}</Text></View>;

export function ProgramBrowser({ currentId, onOpen }: { currentId?: string; onOpen(program: GymProgram): void }) {
  const [filters, setFilters] = useState<ProgramFilters>({});
  const programs = filterPrograms(filters);
  const change = (next: ProgramFilters) => setFilters(previous => ({ ...previous, ...next }));
  return <View style={styles.browser}>
    <Choice label="Experience" all="All levels" value={filters.level} options={levels} labels={levelLabels} onChange={level => change({ level })}/>
    <Choice label="Made for" all="Everyone" value={filters.audience} options={audiences} labels={audienceLabels} onChange={audience => change({ audience })}/>
    <Choice label="Where you train" all="Anywhere" value={filters.setting} options={settings} labels={settingLabels} onChange={setting => change({ setting })}/>
    <Text style={styles.count}>{programs.length} {programs.length === 1 ? 'program' : 'programs'} · anyone can follow any program</Text>
    {programs.map(program => <ProgramCard key={program.id} program={program} current={program.id === currentId} onPress={() => onOpen(program)}/>)}
    {!programs.length && <View style={styles.card}><Text style={styles.name}>No program matches every filter.</Text>
      <Pressable accessibilityRole="button" onPress={() => setFilters({})}><Text style={styles.reset}>Clear filters</Text></Pressable></View>}
  </View>;
}

const styles = StyleSheet.create({
  browser: { gap: 10 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 13, minHeight: 36, justifyContent: 'center' },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.ink, fontWeight: '600' }, selectedText: { color: colors.onAccent },
  count: { color: colors.muted, fontSize: 13, marginTop: 2 },
  card: { gap: 8, padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  currentCard: { borderColor: colors.moss, borderWidth: 2 }, pressed: { opacity: 0.8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, cardTitle: { flex: 1, gap: 2 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }, name: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  tagline: { color: colors.muted, lineHeight: 20 }, facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4 }, factText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  badge: { backgroundColor: colors.moss, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }, badgeText: { color: colors.onAccent, fontSize: 12, fontWeight: '800' },
  reset: { color: colors.moss, fontWeight: '700' },
});
