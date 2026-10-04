import { Pressable, StyleSheet, Text, View } from 'react-native';
import { categorySchema } from '@campusflow/contracts';
import { Button, Card, Field, colors } from '@/components/ui';
import type { TaskFilters } from '@/features/task-filters';
export function TaskFilterControls({ filters, onChange, onReset }: { filters: TaskFilters; onChange(patch: Partial<TaskFilters>): void; onReset(): void }) {
  const active = !!filters.search || filters.category !== 'all' || filters.completion !== 'all';
  return <Card><Field label="Search personal tasks" value={filters.search} onChangeText={search => onChange({ search })} placeholder="Title or description"/>
    <Text style={styles.label}>Category</Text><View style={styles.options}>
      {(['all', ...categorySchema.options] as const).map(category => <Pressable key={category} accessibilityRole="radio"
        accessibilityLabel={category === 'all' ? 'All categories' : category[0].toUpperCase() + category.slice(1)} accessibilityState={{ checked: category === filters.category }}
        onPress={() => onChange({ category })} style={[styles.choice, category === filters.category && styles.selected]}>
        <Text style={styles.label}>{category === 'all' ? 'All categories' : category[0].toUpperCase() + category.slice(1)}</Text>
      </Pressable>)}
    </View><Text style={styles.label}>Completion</Text><View style={styles.options}>
      {([{ value: 'all', label: 'All tasks' }, { value: 'open', label: 'Open tasks' }, { value: 'completed', label: 'Completed tasks' }] as const).map(option => <Pressable key={option.value}
        accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: option.value === filters.completion }}
        onPress={() => onChange({ completion: option.value })} style={[styles.choice, option.value === filters.completion && styles.selected]}><Text style={styles.label}>{option.label}</Text></Pressable>)}
    </View>{active && <Button title="Clear filters" tone="plain" onPress={onReset}/>}
  </Card>;
}
const styles = StyleSheet.create({ label: { color: colors.ink, fontWeight: '700' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }, selected: { backgroundColor: colors.sage, borderColor: colors.moss } });
