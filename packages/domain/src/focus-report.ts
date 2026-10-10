import { addCalendarDays, localDateAt } from './index';

export interface FocusSession {
  id: string; taskId: string | null; title: string; endedAt: string; focusedSeconds: number;
  outcome: 'completed' | 'interrupted';
}
export function summarizeFocusWeek(sessions: FocusSession[], start: string, timeZone: string, now: string) {
  const today = localDateAt(now, timeZone), through = addCalendarDays(start, 6);
  const seen = new Set<string>();
  const rows = sessions.filter(row => {
    if (seen.has(row.id) || Date.parse(row.endedAt) > Date.parse(now)) return false;
    seen.add(row.id);
    const date = localDateAt(row.endedAt, timeZone);
    return date >= start && date <= through;
  }).sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt) || a.id.localeCompare(b.id));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(start, index), records = rows.filter(row => localDateAt(row.endedAt, timeZone) === date);
    return { date, status: date > today ? 'future' as const : 'elapsed' as const,
      seconds: records.reduce((sum, row) => sum + row.focusedSeconds, 0), blocks: records.length };
  });
  const groups = new Map<string, { key: string; taskId: string | null; title: string; seconds: number; blocks: number }>();
  for (const row of rows) {
    const key = row.taskId ?? 'unlinked';
    const group = groups.get(key) ?? { key, taskId: row.taskId, title: row.taskId ? row.title : 'Unlinked study', seconds: 0, blocks: 0 };
    group.seconds += row.focusedSeconds; group.blocks++; groups.set(key, group);
  }
  return { start, through, days, seconds: rows.reduce((sum, row) => sum + row.focusedSeconds, 0), blocks: rows.length,
    completedBlocks: rows.filter(row => row.outcome === 'completed').length, studyDays: days.filter(day => day.seconds > 0).length,
    tasks: [...groups.values()].sort((a, b) => b.seconds - a.seconds || a.key.localeCompare(b.key)) };
}
