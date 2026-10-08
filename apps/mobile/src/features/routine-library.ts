import type { Goal } from '@/lib/types';
import { goalFormDefaults, type GoalFormValues } from './goal-form';

export type RoutineGroup = 'Study' | 'Wellbeing' | 'Everyday';
export type RoutineTemplate = {
  id: string; group: RoutineGroup; title: string; description: string;
  category: Goal['category']; schedule: Goal['schedule'];
};
export const routineTemplates: readonly RoutineTemplate[] = [
  { id: 'lecture-review', group: 'Study', title: 'Review lecture notes', description: 'Spend a few minutes finding the main ideas while the lecture is fresh.', category: 'university', schedule: { kind: 'weekly', weekdays: [1, 2, 3, 4, 5] } },
  { id: 'daily-reading', group: 'Study', title: 'Read for 20 minutes', description: 'Keep one reading moving forward, a little at a time.', category: 'university', schedule: { kind: 'daily' } },
  { id: 'weekly-plan', group: 'Study', title: 'Plan the week ahead', description: 'Look at deadlines and make room for the work that needs your attention.', category: 'university', schedule: { kind: 'weekly', weekdays: [7] } },
  { id: 'practice-topic', group: 'Study', title: 'Practice one tricky topic', description: 'Try a few questions or explain an idea without looking at your notes.', category: 'university', schedule: { kind: 'weeklyTarget', target: 3 } },
  { id: 'outside-walk', group: 'Wellbeing', title: 'Take a walk outside', description: 'Step away from your desk and get a change of scenery.', category: 'health', schedule: { kind: 'daily' } },
  { id: 'movement', group: 'Wellbeing', title: 'Make time to move', description: 'Pick an activity you enjoy and a weekly pace that works for you.', category: 'fitness', schedule: { kind: 'weeklyTarget', target: 3 } },
  { id: 'screen-break', group: 'Wellbeing', title: 'Take a screen break', description: 'Pause between study blocks and give yourself a little breathing room.', category: 'health', schedule: { kind: 'daily' } },
  { id: 'wind-down', group: 'Wellbeing', title: 'Wind down before bed', description: 'Choose one calm activity to mark the end of your day.', category: 'health', schedule: { kind: 'daily' } },
  { id: 'prepare-tomorrow', group: 'Everyday', title: 'Prepare for tomorrow', description: 'Check what is coming up and get the essentials ready.', category: 'personal', schedule: { kind: 'weekly', weekdays: [1, 2, 3, 4, 7] } },
  { id: 'tidy-space', group: 'Everyday', title: 'Reset your study space', description: 'Clear a little clutter so the next study block is easier to start.', category: 'personal', schedule: { kind: 'weekly', weekdays: [5] } },
  { id: 'friend', group: 'Everyday', title: 'Reach out to a friend', description: 'Send a message, make a plan, or share a small moment from your week.', category: 'social', schedule: { kind: 'weeklyTarget', target: 2 } },
  { id: 'groceries', group: 'Everyday', title: 'Plan a grocery trip', description: 'Check what you have and write down a few things you need.', category: 'personal', schedule: { kind: 'weekly', weekdays: [6] } },
];

export function routineFormDefaults(template: RoutineTemplate, timeZone: string): GoalFormValues {
  return { ...goalFormDefaults(null, timeZone), title: template.title, category: template.category,
    frequency: template.schedule.kind,
    weekdays: template.schedule.kind === 'weekly' ? [...template.schedule.weekdays] : [],
    target: template.schedule.kind === 'weeklyTarget' ? String(template.schedule.target) : '3' };
}
export function routineScheduleLabel(schedule: Goal['schedule']): string {
  if (schedule.kind === 'daily') return 'Every day';
  if (schedule.kind === 'weeklyTarget') return `${schedule.target} times per week · choose your days`;
  if (schedule.weekdays.join(',') === '1,2,3,4,5') return 'Monday–Friday';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return schedule.weekdays.map(day => days[day - 1]).join(' · ');
}
export function findExistingRoutine(template: RoutineTemplate, goals: Goal[] | undefined) {
  const normalize = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();
  // This is a title hint, not entity identity or an automatic edit/merge rule.
  return goals?.find(goal => normalize(goal.title) === normalize(template.title));
}
