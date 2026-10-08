import { createGoalSchema } from '@campusflow/contracts';
import { goalOccursOn } from '@campusflow/domain';
import { routineFormDefaults, routineTemplates } from '../src/features/routine-library';
import { goalFormRequest } from '../src/features/goal-form';

describe('student starter schedules', () => {
  it.each(routineTemplates)('creates the $title starter through the existing Goal contract', template => {
    const request = goalFormRequest(routineFormDefaults(template, 'Pacific/Honolulu'), null);
    expect(request.path).toBe('/goals'); expect(request.method).toBe('POST');
    expect(createGoalSchema.parse(request.body)).toMatchObject({ title: template.title, category: template.category, timeZone: 'Pacific/Honolulu' });
    expect(request.body).not.toHaveProperty('reminder');
  });
  it('keeps lecture review on weekdays and weekly planning on Sunday', () => {
    const occurs = (id: string, date: string) => {
      const template = routineTemplates.find(item => item.id === id)!;
      return goalOccursOn({ id, title: template.title, schedule: template.schedule, timeZone: 'America/Edmonton' }, date);
    };
    expect(occurs('lecture-review', '2025-03-10')).toBe(true);
    expect(occurs('lecture-review', '2025-03-15')).toBe(false);
    expect(occurs('weekly-plan', '2025-03-09')).toBe(true);
    expect(occurs('weekly-plan', '2025-03-10')).toBe(false);
  });
  it('does not turn a flexible weekly target into a mandatory daily Today occurrence', () => {
    const template = routineTemplates.find(item => item.id === 'movement')!;
    const goal = { id: template.id, title: template.title, schedule: template.schedule, timeZone: 'America/Edmonton' };
    expect(goalOccursOn(goal, '2025-03-09')).toBe(false);
    expect(goalOccursOn(goal, '2025-03-10')).toBe(false);
  });
});
