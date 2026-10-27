import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { categorySchema } from '@campusflow/contracts';
import { colors } from '@/components/ui';
import type { TaskFilters } from '@/features/task-filters';

const completions = [{ value: 'all', label: 'All tasks', short: 'All' }, { value: 'open', label: 'Open tasks', short: 'Open' }, { value: 'completed', label: 'Completed tasks', short: 'Done' }] as const;
const categoryLabel = (category: TaskFilters['category']) => category === 'all' ? 'All categories' : category[0].toUpperCase() + category.slice(1);

export function TaskFilterControls({ filters, onChange, onReset }: { filters: TaskFilters; onChange(patch: Partial<TaskFilters>): void; onReset(): void }) {
  const active = !!filters.search || filters.category !== 'all' || filters.completion !== 'all';
  return <View style={styles.wrap}>
    <View style={styles.search}><Ionicons name="search" size={18} color={colors.muted}/>
      <TextInput accessibilityLabel="Search personal tasks" value={filters.search} onChangeText={search => onChange({ search })} placeholder="Search tasks"
        placeholderTextColor={colors.muted} style={styles.input} autoCorrect={false}/>
      {!!filters.search && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => onChange({ search: '' })}>
        <Ionicons name="close-circle" size={18} color={colors.muted}/></Pressable>}
    </View>
    <View style={styles.segment} accessibilityRole="radiogroup">
      {completions.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
        accessibilityState={{ checked: option.value === filters.completion }} onPress={() => onChange({ completion: option.value })}
        style={[styles.segmentItem, option.value === filters.completion && styles.segmentSelected]}>
        <Text style={[styles.segmentText, option.value === filters.completion && styles.segmentTextSelected]}>{option.short}</Text></Pressable>)}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup">
      {(['all', ...categorySchema.options] as const).map(category => <Pressable key={category} accessibilityRole="radio" accessibilityLabel={categoryLabel(category)}
        accessibilityState={{ checked: category === filters.category }} onPress={() => onChange({ category })}
        style={[styles.chip, category === filters.category && styles.chipSelected]}>
        <Text style={[styles.chipText, category === filters.category && styles.chipTextSelected]}>{category === 'all' ? 'All' : categoryLabel(category)}</Text>
      </Pressable>)}
    </ScrollView>
    {active && <Pressable accessibilityRole="button" onPress={onReset} style={styles.clear} hitSlop={6}>
      <Ionicons name="close" size={14} color={colors.moss}/><Text style={styles.clearText}>Clear filters</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  input: { flex: 1, minHeight: 44, color: colors.ink, fontSize: 15 },
  segment: { flexDirection: 'row', backgroundColor: colors.sage, borderRadius: 12, padding: 3 },
  segmentItem: { flex: 1, minHeight: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: .08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { color: colors.muted, fontWeight: '700' }, segmentTextSelected: { color: colors.ink },
  chips: { gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.ink, fontWeight: '700', fontSize: 13 }, chipTextSelected: { color: colors.onAccent },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }, clearText: { color: colors.moss, fontWeight: '700' },
});
