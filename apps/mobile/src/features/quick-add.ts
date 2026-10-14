import { addCalendarDays } from '@campusflow/domain';
import { dateSchema } from '@campusflow/contracts';
import type { PersonalTask } from '@/lib/types';
import type { TaskFormValues } from './task-form';

export type QuickAddResult = {
  title: string;
  values: Partial<TaskFormValues>;
  /** Human summaries of what was recognised, in input order of importance. */
  details: string[];
};

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const weekdayPattern = '(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthPattern = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const categoryAliases: Record<string, PersonalTask['category']> = {
  university: 'university', uni: 'university', school: 'university', class: 'university', study: 'university', course: 'university',
  personal: 'personal', home: 'personal', errand: 'personal', errands: 'personal',
  health: 'health', fitness: 'fitness', gym: 'fitness', sport: 'fitness', workout: 'fitness',
  work: 'work', job: 'work', social: 'social', friends: 'social', other: 'other',
};
const priorities: Record<string, PersonalTask['priority']> = { '!high': 'high', '!h': 'high', '!!!': 'high', '!1': 'high', '!medium': 'medium', '!m': 'medium', '!!': 'medium', '!2': 'medium', '!low': 'low', '!l': 'low', '!3': 'low' };

const pad = (value: number) => String(value).padStart(2, '0');
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

/** Remove the first match of `pattern` (bounded by whitespace) and return its groups. */
function take(text: string, pattern: string): { rest: string; groups: string[] } | undefined {
  const match = new RegExp(`(^|\\s)${pattern}(?=\\s|$)`, 'i').exec(text);
  if (!match) return undefined;
  return { rest: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`, groups: match.slice(2).map(value => value ?? '') };
}

function parseTime(text: string) {
  const noon = take(text, '(?:at\\s+)?(noon|midnight)');
  if (noon) return { rest: noon.rest, time: noon.groups[0].toLowerCase() === 'noon' ? '12:00' : '00:00' };
  const meridiem = take(text, '(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s?(am|pm)');
  if (meridiem) {
    const [hours, minutes = '00', half] = meridiem.groups, hour = Number(hours), minute = Number(minutes || '0');
    if (hour >= 1 && hour <= 12 && minute < 60) return { rest: meridiem.rest, time: `${pad(hour % 12 + (half.toLowerCase() === 'pm' ? 12 : 0))}:${pad(minute)}` };
  }
  const clock = take(text, '(?:at\\s+)?(\\d{1,2}):(\\d{2})');
  if (clock) {
    const [hours, minutes] = clock.groups.map(Number);
    if (hours < 24 && minutes < 60) return { rest: clock.rest, time: `${pad(hours)}:${pad(minutes)}` };
  }
  return undefined;
}

function parseDate(text: string, today: string) {
  const simple = take(text, '(?:on\\s+)?(today|tod|tonight|tomorrow|tmrw?|tmr)');
  if (simple) {
    const word = simple.groups[0].toLowerCase();
    return { rest: simple.rest, date: word.startsWith('tod') || word === 'tonight' ? today : addCalendarDays(today, 1), tonight: word === 'tonight' };
  }
  const relative = take(text, 'in\\s+(\\d{1,3})\\s+(days?|weeks?)');
  if (relative) {
    const amount = Number(relative.groups[0]) * (relative.groups[1].toLowerCase().startsWith('week') ? 7 : 1);
    if (amount <= 365) return { rest: relative.rest, date: addCalendarDays(today, amount) };
  }
  const weekday = take(text, `(?:on\\s+)?(next\\s+)?${weekdayPattern}`);
  if (weekday) {
    const target = weekdays.findIndex(name => name.startsWith(weekday.groups[1].toLowerCase().slice(0, 3))) + 1;
    const current = weekdayOf(today);
    const ahead = weekday.groups[0] ? target - current + 7 : (target - current + 7) % 7;
    return { rest: weekday.rest, date: addCalendarDays(today, ahead) };
  }
  const monthFirst = take(text, `(?:on\\s+)?${monthPattern}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?`);
  const dayFirst = monthFirst ? undefined : take(text, `(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthPattern}`);
  const found = monthFirst ? { rest: monthFirst.rest, month: monthFirst.groups[0], day: monthFirst.groups[1] }
    : dayFirst ? { rest: dayFirst.rest, month: dayFirst.groups[1], day: dayFirst.groups[0] } : undefined;
  if (found) {
    const month = months.indexOf(found.month.toLowerCase().slice(0, 3)) + 1, year = Number(today.slice(0, 4));
    const candidate = (value: number) => `${value}-${pad(month)}-${pad(Number(found.day))}`;
    const date = candidate(year) >= today ? candidate(year) : candidate(year + 1);
    if (dateSchema.safeParse(date).success) return { rest: found.rest, date };
  }
  return undefined;
}

const tidy = (text: string) => text.replace(/\s+/g, ' ').replace(/(^|\s)(at|on|due|by|before)$/i, '').trim();

/**
 * Parse a one-line task such as "Essay draft due fri 5pm #uni !high 45m".
 * Dates resolve against the account `today`; without a date the task is planned
 * for `planDate`. "due"/"by"/"before" mark a deadline, otherwise a date is the
 * planned day. Times stay wall-clock values; the editor's validation converts
 * them in the account zone and rejects missing or repeated DST times.
 */
export function parseQuickAdd(input: string, today: string, planDate = today): QuickAddResult {
  let text = ` ${input.trim()} `;
  const values: Partial<TaskFormValues> = {}, details: string[] = [];
  for (const [token, priority] of Object.entries(priorities)) {
    const found = take(text, token.replace(/[!]/g, '\\!'));
    if (found) { text = found.rest; values.priority = priority; details.push(`${priority[0].toUpperCase()}${priority.slice(1)} priority`); break; }
  }
  const tag = take(text, '#([a-z]+)');
  if (tag && categoryAliases[tag.groups[0].toLowerCase()]) {
    text = tag.rest; values.category = categoryAliases[tag.groups[0].toLowerCase()];
    details.push(values.category[0].toUpperCase() + values.category.slice(1));
  }
  const estimate = take(text, '(?:for\\s+)?(\\d{1,3}(?:\\.\\d)?)\\s?(m|mins?|minutes?|h|hrs?|hours?)');
  if (estimate) {
    const minutes = Math.round(Number(estimate.groups[0]) * (estimate.groups[1].toLowerCase().startsWith('h') ? 60 : 1));
    if (minutes >= 1 && minutes <= 1440) { text = estimate.rest; values.estimatedMinutes = String(minutes); details.push(`${minutes} min`); }
  }
  const deadline = /(^|\s)(due|by|before)(\s|$)/i.test(text);
  const date = parseDate(text, today);
  if (date) text = date.rest;
  const time = parseTime(text);
  if (time) text = time.rest;
  const resolvedTime = time?.time ?? (date?.tonight ? '20:00' : undefined);
  if (date || resolvedTime) {
    const day = date?.date ?? (deadline ? today : planDate);
    const prefix = deadline ? 'due' : 'scheduled';
    Object.assign(values, { [`${prefix}Mode`]: resolvedTime ? 'instant' : 'date', [`${prefix}Date`]: day, [`${prefix}Time`]: resolvedTime ?? '' });
    if (deadline) text = text.replace(/(^|\s)(due|by|before)(?=\s|$)/i, ' ');
    const dayLabel = day === today ? 'today' : day === addCalendarDays(today, 1) ? 'tomorrow'
      : new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
    const timeLabel = resolvedTime && new Date(`2000-01-01T${resolvedTime}:00Z`).toLocaleTimeString([], { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
    details.unshift(`${deadline ? 'Due' : 'Planned'} ${dayLabel}${timeLabel ? ` · ${timeLabel}` : ''}`);
  } else {
    Object.assign(values, { scheduledMode: 'date', scheduledDate: planDate, scheduledTime: '' });
  }
  const title = tidy(text);
  return { title, values: { ...values, title }, details };
}
