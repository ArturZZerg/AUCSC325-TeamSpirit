import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { UpNextCard } from '../src/features/up-next-card';
import type { PlanItem } from '../src/lib/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const item: PlanItem = { key: 'k', kind: 'personalTask', entityId: '10000000-0000-4000-8000-000000000001', occurrenceKey: null, title: 'Essay draft',
  schedule: null, due: null, state: 'overdue', isMainGoal: false, priority: 'high', allowedActions: ['complete'] };
beforeEach(() => jest.clearAllMocks());

it('suggests focusing on a one-time task', () => {
  render(<UpNextCard next={{ kind: 'item', item, reason: 'Overdue since Tue, Oct 13' }}/>);
  expect(screen.getByText('Overdue since Tue, Oct 13')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Focus on this: Essay draft' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/focus', params: { taskId: item.entityId } });
});
it('sends coursework and exams to study planning, and offers nothing for a repeating task', () => {
  const view = render(<UpNextCard next={{ kind: 'exam', exam: { id: 'e', title: 'Midterm', date: '2026-10-17', daysLeft: 2 }, reason: 'Exam in 2 days' }}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Plan study: Midterm' })); expect(router.push).toHaveBeenCalledWith('/academics');
  view.rerender(<UpNextCard next={{ kind: 'item', item: { ...item, occurrenceKey: '2026-10-15' }, reason: 'Next in today’s plan' }}/>);
  expect(screen.queryByRole('button')).toBeNull(); expect(screen.getByText('Essay draft')).toBeOnTheScreen();
  view.rerender(<UpNextCard next={undefined}/>); expect(screen.queryByText('UP NEXT')).toBeNull();
});
