import { dateSchema, focusHistorySchema, instantSchema } from '@campusflow/contracts';
import { addCalendarDays, localDateAt, summarizeFocusWeek } from '@campusflow/domain';

export function studyTimeLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remaining = seconds % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', remaining || (!hours && !minutes) ? `${remaining}s` : ''].filter(Boolean).join(' ');
}
/** Reports only the account/calendar window proven by a validated history read. */
export function buildStudyReport(raw: unknown, accountId: string, timeZone: string, start: string, now: string) {
  const result = focusHistorySchema.safeParse(raw);
  if (!result.success || !dateSchema.safeParse(start).success || !instantSchema.safeParse(now).success) return undefined;
  const history = result.data, through = addCalendarDays(start, 6), previousStart = addCalendarDays(start, -7);
  if (history.accountId !== accountId || history.timeZone !== timeZone || history.from > start || history.through < through
    || new Set(history.sessions.map(row => row.id)).size !== history.sessions.length
    || history.sessions.some(row => { const date = localDateAt(row.endedAt, timeZone); return date < history.from || date > history.through; })) return undefined;
  return { ...summarizeFocusWeek(history.sessions, start, timeZone, now), capturedAt: history.capturedAt,
    previous: history.from <= previousStart ? summarizeFocusWeek(history.sessions, previousStart, timeZone, now) : undefined };
}
