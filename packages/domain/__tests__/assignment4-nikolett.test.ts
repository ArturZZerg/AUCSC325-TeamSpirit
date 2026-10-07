import {
  academicReminderFireAt,
  goalOccurrenceDate,
  weeklyGoalProgress,
  type Goal,
  type GoalCompletion,
} from '../src';

describe('Assignment 4 - Nikolett Artemieva', () => {
  describe('academicReminderFireAt', () => {
    const due = { kind: 'instant' as const, at: '2026-10-10T12:00:00Z' };

    describe('Boundary value testing', () => {
      it.each([
        [0, '2026-10-10T12:00:00Z'],
        [1, '2026-10-10T11:59:00Z'],
        [2, '2026-10-10T11:58:00Z'],
      ])('handles leadMinutes=%i at and immediately above zero', (leadMinutes, expected) => {
        expect(academicReminderFireAt(due, leadMinutes, 'unsubmitted', true)).toBe(expected);
      });

      it('returns null when an extreme lead time cannot use the four-digit-year wire format', () => {
        expect(academicReminderFireAt(due, 2147483647, 'unsubmitted', true)).toBeNull();
      });
    });

    describe('Equivalence class partitioning', () => {
      it.each([
        ['exact instant', due, 60, 'unsubmitted', true, '2026-10-10T11:00:00Z'],
        ['date-only deadline', { kind: 'date' as const, date: '2026-10-10' }, 60, 'unsubmitted', true, null],
        ['missing deadline', null, 60, 'unsubmitted', true, null],
        ['no reminder configured', due, null, 'unsubmitted', true, null],
        ['submitted item', due, 60, 'submitted', true, null],
        ['graded item', due, 60, 'graded', true, null],
        ['inactive item', due, 60, 'unsubmitted', false, null],
      ] as const)('%s', (_name, deadline, leadMinutes, state, active, expected) => {
        expect(academicReminderFireAt(deadline, leadMinutes, state, active)).toBe(expected);
      });
    });

    describe('Combinatorial testing', () => {
      it.each([
        ['instant + 15 + missing state + inactive', due, 15, null, false, null],
        ['instant + 90 + graded + inactive', due, 90, 'graded', false, null],
        ['date-only + 0 + submitted + inactive', { kind: 'date' as const, date: '2026-10-10' }, 0, 'submitted', false, null],
        ['missing due + null lead + graded + active', null, null, 'graded', true, null],
        ['instant + 120 + missing state + active', due, 120, null, true, '2026-10-10T10:00:00Z'],
        ['instant + 30 + unsubmitted + active', due, 30, 'unsubmitted', true, '2026-10-10T11:30:00Z'],
      ] as const)('%s', (_name, deadline, leadMinutes, state, active, expected) => {
        expect(academicReminderFireAt(deadline, leadMinutes, state, active)).toBe(expected);
      });
    });
  });

  describe('goalOccurrenceDate', () => {
    describe('Boundary value testing', () => {
      it.each([
        ['one second before goal midnight', '2026-10-04T14:59:59Z', '2026-10-04'],
        ['exactly at goal midnight', '2026-10-04T15:00:00Z', '2026-10-05'],
        ['one second after goal midnight', '2026-10-04T15:00:01Z', '2026-10-05'],
      ])('%s', (_name, now, expected) => {
        expect(goalOccurrenceDate('Asia/Tokyo', '2026-10-04', 'America/Edmonton', now)).toBe(expected);
      });
    });

    describe('Equivalence class partitioning', () => {
      it.each([
        ['same timezone', 'America/Edmonton', 'America/Edmonton', '2026-10-04T18:00:00Z', '2026-10-04', '2026-10-04'],
        ['goal ahead', 'America/Edmonton', 'Asia/Tokyo', '2026-10-04T18:00:00Z', '2026-10-04', '2026-10-05'],
        ['goal behind', 'Asia/Tokyo', 'America/Edmonton', '2026-10-04T18:00:00Z', '2026-10-05', '2026-10-04'],
        ['date-line difference', 'Pacific/Honolulu', 'Pacific/Kiritimati', '2026-10-04T12:00:00Z', '2026-10-04', '2026-10-05'],
        ['historical day', 'America/Edmonton', 'Asia/Tokyo', '2026-10-04T18:00:00Z', '2026-10-03', '2026-10-03'],
      ])('%s', (_name, accountZone, goalZone, now, accountDate, expected) => {
        expect(goalOccurrenceDate(goalZone, accountDate, accountZone, now)).toBe(expected);
      });
    });

    describe('Combinatorial testing', () => {
      it.each([
        ['Edmonton / Tokyo / previous account day at account midnight', 'America/Edmonton', 'Asia/Tokyo', '2026-10-03', '2026-10-04T06:00:00Z', '2026-10-03'],
        ['Edmonton / Tokyo / future account day', 'America/Edmonton', 'Asia/Tokyo', '2026-10-06', '2026-10-04T18:00:00Z', '2026-10-06'],
        ['Tokyo / Edmonton / historical day', 'Asia/Tokyo', 'America/Edmonton', '2026-10-04', '2026-10-05T03:00:00Z', '2026-10-03'],
        ['Honolulu / Kiritimati / historical day', 'Pacific/Honolulu', 'Pacific/Kiritimati', '2026-10-03', '2026-10-04T12:00:00Z', '2026-10-04'],
        ['Tokyo / New York / spring DST', 'Asia/Tokyo', 'America/New_York', '2025-03-08', '2025-03-09T07:00:00Z', '2025-03-07'],
        ['Tokyo / New York / fall DST', 'Asia/Tokyo', 'America/New_York', '2025-11-01', '2025-11-02T06:30:00Z', '2025-10-31'],
      ])('%s', (_name, accountZone, goalZone, accountDate, now, expected) => {
        expect(goalOccurrenceDate(goalZone, accountDate, accountZone, now)).toBe(expected);
      });
    });
  });

  describe('weeklyGoalProgress', () => {
    const goal = (target = 3): Pick<Goal, 'id' | 'schedule'> => ({
      id: 'goal-1', schedule: { kind: 'weeklyTarget', target },
    });
    const completion = (
      occurrenceKey: string,
      state: GoalCompletion['state'] = 'completed',
      goalId = 'goal-1',
    ): Pick<GoalCompletion, 'goalId' | 'occurrenceKey' | 'state'> => ({
      goalId, occurrenceKey, state,
    });

    describe('Boundary value testing', () => {
      it.each([[2, false], [3, true], [4, true]])(
        'checks reached around target=3 with %i completions',
        (count, reached) => {
          const history = Array.from({ length: count }, (_, i) =>
            completion(`2026-10-${String(5 + i).padStart(2, '0')}`));
          expect(weeklyGoalProgress(goal(3), history, '2026-10-11')).toMatchObject({
            completed: count, target: 3, reached,
          });
        },
      );

      it('includes Monday, the lower week boundary', () => {
        expect(weeklyGoalProgress(goal(3), [completion('2026-10-05')], '2026-10-11')?.completed).toBe(1);
      });

      it('includes the supplied date but excludes the following day', () => {
        const history = [completion('2026-10-07'), completion('2026-10-08')];
        expect(weeklyGoalProgress(goal(3), history, '2026-10-07')?.completed).toBe(1);
      });

      it.each([[1, 1], [7, 7]])('handles valid target boundary %i', (target, count) => {
        const history = Array.from({ length: count }, (_, i) =>
          completion(`2026-10-${String(5 + i).padStart(2, '0')}`));
        expect(weeklyGoalProgress(goal(target), history, '2026-10-11')).toMatchObject({
          completed: count, target, reached: true,
        });
      });
    });

    describe('Equivalence class partitioning', () => {
      it('returns undefined for a daily goal', () => {
        expect(weeklyGoalProgress(
          { id: 'goal-1', schedule: { kind: 'daily' } },
          [completion('2026-10-06')], '2026-10-11',
        )).toBeUndefined();
      });

      it('returns undefined for a selected-weekday goal', () => {
        expect(weeklyGoalProgress(
          { id: 'goal-1', schedule: { kind: 'weekly', weekdays: [1, 3, 5] } },
          [completion('2026-10-06')], '2026-10-11',
        )).toBeUndefined();
      });

      it.each([
        ['matching completed', [completion('2026-10-06')], 1],
        ['skipped', [completion('2026-10-06', 'skipped')], 0],
        ['different goal', [completion('2026-10-06', 'completed', 'goal-2')], 0],
        ['before week', [completion('2026-10-04')], 0],
        ['after supplied date', [completion('2026-10-08')], 0],
        ['duplicate date', [completion('2026-10-06'), completion('2026-10-06')], 1],
      ] as const)('%s', (_name, history, expected) => {
        expect(weeklyGoalProgress(goal(3), [...history], '2026-10-07')?.completed).toBe(expected);
      });
    });

    describe('Combinatorial testing', () => {
      it('combines goal identity, state, date and duplicate handling', () => {
        const history = [
          completion('2026-10-05'),
          completion('2026-10-05'),
          completion('2026-10-06', 'skipped'),
          completion('2026-10-07', 'completed', 'goal-2'),
          completion('2026-10-04'),
          completion('2026-10-08'),
          completion('2026-10-07'),
        ];
        expect(weeklyGoalProgress(goal(3), history, '2026-10-07')).toEqual({
          weekStart: '2026-10-05',
          endExclusive: '2026-10-12',
          completed: 2,
          target: 3,
          reached: false,
        });
      });

      it.each([
        [2, ['2026-10-05', '2026-10-06', '2026-10-07'], 3, true],
        [4, ['2026-10-05', '2026-10-06', '2026-10-07'], 3, false],
        [3, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'], 4, true],
        [7, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'], 6, false],
      ] as const)('combines target=%i with history %j', (target, dates, completed, reached) => {
        expect(weeklyGoalProgress(goal(target), dates.map(date => completion(date)), '2026-10-11')).toMatchObject({
          completed, target, reached,
        });
      });
    });
  });
});
