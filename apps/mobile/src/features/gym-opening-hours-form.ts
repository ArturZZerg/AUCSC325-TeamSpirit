import { gymOpeningHoursSchema, type GymOpeningHours } from '@campusflow/contracts';

/** Gym wall-clock times, not dates or device-zone instants. */
export function parseGymTime(input: string): { time: string; minutes: number } | undefined {
  const text = input.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text) ?? /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(text);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0), half = match[3]?.toLowerCase();
  if (minute > 59 || (half ? hour < 1 || hour > 12 : hour > 23)) return undefined;
  if (half) hour = hour % 12 + (half === 'pm' ? 12 : 0);
  return { time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, minutes: hour * 60 + minute };
}

export function gymClosesNextDay(opens: string, closes: string): boolean {
  const start = parseGymTime(opens), end = parseGymTime(closes);
  return !!start && !!end && end.minutes < start.minutes;
}

export function newGymHours(timeZone: string): GymOpeningHours {
  return { timeZone, days: Array.from({ length: 7 }, (_, index) => index < 5
    ? { kind: 'open', opens: '09:00', closes: '17:00' } : { kind: 'closed' }) };
}

export function validateGymHours(draft: GymOpeningHours) {
  const errors: Record<string, string> = {};
  const days = draft.days.map((day, index) => {
    if (day.kind !== 'open') return day;
    const opens = parseGymTime(day.opens), closes = parseGymTime(day.closes);
    const hint = 'Enter a time such as 7:00, 07:00, 7 AM or 7:30pm (HH:mm is also accepted).';
    if (!opens) errors[`days.${index}.opens`] = hint;
    if (!closes) errors[`days.${index}.closes`] = hint;
    if (opens && closes && opens.minutes === closes.minutes)
      errors[`days.${index}.closes`] = 'Closing time must differ from opening time. Use Closed for a closed day.';
    return { ...day, opens: opens?.time ?? day.opens, closes: closes?.time ?? day.closes };
  });
  const parsed = gymOpeningHoursSchema.safeParse({ ...draft, timeZone: draft.timeZone.trim(), days });
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (key === 'timeZone') errors.timeZone = 'Enter a valid IANA timezone, such as America/Edmonton.';
  }
  return parsed.success && !Object.keys(errors).length
    ? { success: true as const, data: parsed.data }
    : { success: false as const, errors };
}
