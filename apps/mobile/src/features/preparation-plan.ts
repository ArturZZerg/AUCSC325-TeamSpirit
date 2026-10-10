import { createStudyPlanSchema, dateSchema, localTimeSchema, type CreateStudyPlan } from '@campusflow/contracts';
import { addCalendarDays, distributeStudyDates, instantAtLocalTime, localClockAt, localDateAt } from '@campusflow/domain';
import type { AcademicItem } from '@/lib/types';
import { z } from 'zod';

export const preparationConfigSchema = z.object({
  title: z.string().trim().min(1, 'Give your plan a name.').max(240),
  from: dateSchema, through: dateSchema, count: z.number().int().min(1).max(12),
  minutes: z.number().int().min(1).max(180), weekdays: z.number().int().min(1).max(7).array().min(1, 'Choose at least one study day.'),
  template: z.enum(['assignment', 'revision']),
});
export type PreparationConfig = z.infer<typeof preparationConfigSchema>;
export type PreparationSession = { title: string; date: string; time: string; minutes: number };
export const studyWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function preparationDefaults(item: AcademicItem, today: string, timeZone: string): PreparationConfig {
  const due = item.due?.kind === 'date' ? item.due.date : item.due?.kind === 'instant' ? localDateAt(item.due.at, timeZone) : undefined;
  const latest = addCalendarDays(today, 6);
  return { title: `${item.kind === 'quiz' ? 'Prepare for' : 'Prepare'}: ${item.title}`.slice(0, 240), from: today,
    through: due && due >= today && due < latest ? due : latest,
    count: 3, minutes: 50, weekdays: [1, 2, 3, 4, 5, 6, 7], template: item.kind === 'quiz' ? 'revision' : 'assignment' };
}

export function preparationPreview(item: AcademicItem, value: PreparationConfig): PreparationSession[] {
  const config = preparationConfigSchema.parse(value);
  const dates = distributeStudyDates(config);
  return dates.map((date, index) => {
    const step = config.template === 'revision'
      ? index === 0 ? 'Recall key topics' : index === dates.length - 1 ? 'Practise under exam conditions' : `Practise topic ${index}`
      : index === 0 ? 'Read requirements & outline' : index === dates.length - 1 ? 'Review & final checks' : `Work on section ${index}`;
    return { title: `${step}: ${item.title}`.slice(0, 240), date, time: '', minutes: config.minutes };
  });
}

export function preparationRequest(key: string, item: AcademicItem, title: string, sessions: PreparationSession[], timeZone: string): CreateStudyPlan {
  return createStudyPlanSchema.parse({ requestKey: key, academicItemId: item.id, title,
    sessions: sessions.map(session => {
      dateSchema.parse(session.date);
      if (session.time && !localTimeSchema.safeParse(session.time.trim()).success) throw new Error('Enter a start time as HH:MM.');
      let scheduled: CreateStudyPlan['sessions'][number]['scheduled'] = { kind: 'date', date: session.date };
      if (session.time.trim()) {
        try { scheduled = { kind: 'instant', at: instantAtLocalTime(session.date, session.time.trim(), timeZone) }; }
        catch { throw new Error('A start time is missing or occurs twice in your time zone. Choose another time.'); }
      }
      return { title: session.title, scheduled, estimatedMinutes: session.minutes };
    }),
  });
}

export function sessionsAfterDeadline(item: AcademicItem, sessions: PreparationSession[], timeZone: string): number {
  if (!item.due) return 0;
  const deadline = item.due.kind === 'date' ? item.due.date : localClockAt(item.due.at, timeZone).date;
  const due = item.due;
  return sessions.filter(session => {
    if (session.date > deadline) return true;
    if (due.kind === 'instant' && session.date === deadline) {
      if (!session.time) return true; // Flexible work on a timed deadline day may be late.
      try { return Date.parse(instantAtLocalTime(session.date, session.time, timeZone)) + session.minutes * 60_000 > Date.parse(due.at); }
      catch { return true; }
    }
    return false;
  }).length;
}

// This key deduplicates saves; it is not an authentication credential.
export const preparationSaveKey = () => `study-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
