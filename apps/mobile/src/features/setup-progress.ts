import type { AcademicItem, Goal, PersonalTask } from '@/lib/types';

export type SetupStatus = 'added' | 'ready' | 'unknown';
const status = (rows: unknown[] | undefined): SetupStatus => rows === undefined ? 'unknown' : rows.length ? 'added' : 'ready';

/** Setup reflects saved account records, never visits, button taps or demo data. */
export function setupProgress(tasks: PersonalTask[] | undefined, academic: AcademicItem[] | undefined, goals: Goal[] | undefined) {
  const steps = { task: status(tasks), coursework: status(academic?.filter(item => !item.source.includes('fixture'))), routine: status(goals) };
  return { ...steps, added: Object.values(steps).filter(value => value === 'added').length,
    known: Object.values(steps).filter(value => value !== 'unknown').length };
}
