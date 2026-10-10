import type { ClassSchedule } from '@campusflow/contracts';
export const classFixture = (fields: Partial<ClassSchedule> = {}): ClassSchedule => ({
  id: '20000000-0000-4000-8000-000000000001', title: 'Biology 101 · Lecture', weekdays: [1, 3, 5],
  termStart: '2025-03-01', termEnd: '2025-04-30', startTime: '09:00', endTime: '10:00',
  timeZone: 'America/Edmonton', location: 'Library 204', instructor: 'Dr Green', notes: null, color: 'moss',
  createdAt: '2025-03-01T12:00:00Z', updatedAt: '2025-03-01T12:00:00Z', ...fields,
});
