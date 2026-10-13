import { reminderAfterQuietHours } from '@campusflow/domain';
import type { AcademicItem, CampusEvent, Goal, NotificationPreferences, PersonalTask, Reminder } from '@/lib/types';

export type ReminderSubject = { kind: 'task'; value: PersonalTask } | { kind: 'academic'; value: AcademicItem }
  | { kind: 'goal'; value: Goal } | { kind: 'event'; value: CampusEvent };
export type ReminderRow = { reminder: Reminder; subject?: ReminderSubject; fireAt: string; delayed: boolean; categoryEnabled?: boolean };
const category = { personalTask: 'personalEnabled', academicItem: 'academicEnabled', goal: 'goalEnabled', savedEvent: 'eventEnabled' } as const;

/** Titles and actions come from owned reads, never notification content. */
export function reminderRows(reminders: readonly Reminder[], records: {
  tasks?: readonly PersonalTask[]; academic?: readonly AcademicItem[]; goals?: readonly Goal[]; events?: readonly CampusEvent[];
}, timeZone: string, preferences?: NotificationPreferences): ReminderRow[] {
  const tasks = new Map(records.tasks?.map(row => [row.id, row]));
  const academic = new Map(records.academic?.map(row => [row.id, row]));
  const goals = new Map(records.goals?.map(row => [row.id, row]));
  const events = new Map(records.events?.filter(row => row.saved === true).map(row => [row.id, row]));
  return reminders.map(reminder => {
    let subject: ReminderSubject | undefined;
    const id = reminder.targetId;
    if (reminder.targetKind === 'personalTask' && tasks.has(id)) subject = { kind: 'task', value: tasks.get(id)! };
    if (reminder.targetKind === 'academicItem' && academic.has(id)) subject = { kind: 'academic', value: academic.get(id)! };
    if (reminder.targetKind === 'goal' && goals.has(id)) subject = { kind: 'goal', value: goals.get(id)! };
    if (reminder.targetKind === 'savedEvent' && events.has(id)) subject = { kind: 'event', value: events.get(id)! };
    const fireAt = preferences ? reminderAfterQuietHours(reminder.fireAt, timeZone, preferences.quietHoursStart, preferences.quietHoursEnd) : reminder.fireAt;
    return { reminder, subject, fireAt, delayed: Date.parse(fireAt) !== Date.parse(reminder.fireAt), categoryEnabled: preferences?.[category[reminder.targetKind]] };
  }).sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt) || a.reminder.id.localeCompare(b.reminder.id));
}
