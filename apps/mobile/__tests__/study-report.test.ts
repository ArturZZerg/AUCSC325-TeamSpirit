import { buildStudyReport, studyTimeLabel } from '../src/features/study-report';
import { reportAccount, reportFixture } from './study-report-fixture';
const build = (raw: unknown) => buildStudyReport(raw, reportAccount, 'America/Edmonton', '2025-03-03', '2025-03-09T18:00:00Z');
it('derives the selected week and previous full week from one validated read', () => {
  expect(build(reportFixture())).toMatchObject({ seconds: 1565, blocks: 2, completedBlocks: 1, studyDays: 2,
    previous: { seconds: 1500, blocks: 1 }, capturedAt: '2025-03-09T18:00:00Z' });
});
it.each([{ accountId: '10000000-0000-4000-8000-000000000002' }, { timeZone: 'UTC' }, { from: '2025-03-04' }, { through: '2025-03-08' },
  { sessions: [reportFixture().sessions[0], reportFixture().sessions[0]] }, { sessions: [{ ...reportFixture().sessions[0], focusedSeconds: 2000 }] },
  { sessions: [{ ...reportFixture().sessions[0], startedAt: '2025-03-10T17:00:00Z', endedAt: '2025-03-10T17:25:00Z' }] }])('withholds foreign, malformed and partial coverage %j', invalid => {
  expect(build({ ...reportFixture(), ...invalid })).toBeUndefined();
});
it('does not fabricate a previous week if the read only covers the selected week', () => {
  const fixture = reportFixture(); expect(build({ ...fixture, from: '2025-03-03', sessions: fixture.sessions.slice(0, 2) })?.previous).toBeUndefined();
});
it.each([[0, '0s'], [59, '59s'], [118, '1m 58s'], [3600, '1h'], [3665, '1h 1m 5s']])('formats accumulated seconds precisely: %s', (seconds, label) => {
  expect(studyTimeLabel(seconds)).toBe(label);
});
