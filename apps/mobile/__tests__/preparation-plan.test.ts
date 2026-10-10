import { preparationDefaults, preparationPreview, preparationRequest, sessionsAfterDeadline } from '../src/features/preparation-plan';
import { essay, quiz } from './academic-fixture';
const zone = 'America/Edmonton', key = 'study-test-request-1';
it('defaults to assignment/revision steps with a bounded deadline-aware range', () => {
  expect(preparationDefaults(essay, '2025-03-08', zone)).toMatchObject({ from: '2025-03-08', through: '2025-03-09', template: 'assignment' });
  expect(preparationDefaults(quiz, '2025-03-08', zone).template).toBe('revision');
  expect(preparationDefaults({ ...essay, due: null }, '2025-12-29', zone).through).toBe('2026-01-04');
  expect(preparationDefaults(essay, '2025-03-10', zone).through).toBe('2025-03-16');
});
it('builds an editable step progression and flexible calendar schedules', () => {
  const sessions = preparationPreview(quiz, preparationDefaults(quiz, '2025-03-09', zone));
  expect(sessions.map(session => session.date)).toEqual(['2025-03-09', '2025-03-10', '2025-03-11']);
  expect(sessions[0].title).toContain('Recall'); expect(sessions[2].title).toContain('exam conditions');
  const request = preparationRequest(key, quiz, 'My revision', sessions, zone);
  expect(request.sessions[0]).toEqual({ title: sessions[0].title, scheduled: { kind: 'date', date: '2025-03-09' }, estimatedMinutes: 50 });
});
it('converts local times to UTC and rejects both DST gaps and repeated times', () => {
  const session = { title: 'Practice', date: '2025-03-09', time: '03:30', minutes: 50 };
  expect(preparationRequest(key, quiz, 'Revision', [session], zone).sessions[0].scheduled).toEqual({ kind: 'instant', at: '2025-03-09T09:30:00Z' });
  for (const invalid of [{ date: '2025-03-09', time: '02:30' }, { date: '2025-11-02', time: '01:30' }, { time: '28:00' }, { date: '2025-02-30' }]) {
    expect(() => preparationRequest(key, quiz, 'Revision', [{ ...session, ...invalid }], zone)).toThrow();
  }
});
it('warns when an entire timed session cannot finish before the deadline', () => {
  const item = { ...essay, due: { kind: 'instant' as const, at: '2025-03-09T18:00:00Z' } };
  const session = { title: 'Review', date: '2025-03-09', time: '11:30', minutes: 50 };
  expect(sessionsAfterDeadline(item, [session], zone)).toBe(1);
  expect(sessionsAfterDeadline(item, [{ ...session, time: '11:00' }], zone)).toBe(0);
  expect(sessionsAfterDeadline(item, [{ ...session, time: '' }], zone)).toBe(1);
  expect(sessionsAfterDeadline(essay, [{ ...session, time: '' }], zone)).toBe(0);
  expect(sessionsAfterDeadline({ ...essay, due: null }, [session], zone)).toBe(0);
});
