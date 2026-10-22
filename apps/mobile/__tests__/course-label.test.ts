import { courseLabel } from '../src/features/course-label';

describe('courseLabel', () => {
  it('leads with the catalog code of a cross-listed Canvas course', () => {
    expect(courseLabel({ code: 'AUCSC 325 LAB D01 - AUCSC 325 LEC A01 - Fall 2026', name: 'Software Engineering' })).toBe('AUCSC 325');
    expect(courseLabel({ code: 'CMPUT301', name: 'Intro' })).toBe('CMPUT 301');
  });
  it('falls back to the name and shortens long free-form titles', () => {
    expect(courseLabel({ code: null, name: 'Biology' })).toBe('Biology');
    expect(courseLabel({ code: '  ', name: 'Psych 104' })).toBe('Psych 104');
    expect(courseLabel({ code: null, name: 'A very long student created course title here' })).toBe('A very long student created…');
  });
});
