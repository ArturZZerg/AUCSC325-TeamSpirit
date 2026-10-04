import { academicSnapshotSchema, FixtureCanvasProvider, normalizeCanvasSnapshot } from '../src/integrations/canvas/canvas-provider';

const course = { id: 1, name: 'Software engineering', course_code: 'AUCSC325', workflow_state: 'available' };
const assignment = { id: 2, name: 'Proposal', due_at: '2026-03-08T00:00:00-07:00', submission_types: ['online_upload'] };
const snapshot = (item: unknown = assignment) => ({ courses: [{ course, assignments: [item] }] });

describe('Canvas normalized academic boundary (ToR 9/10)', () => {
  it('converts an offset midnight to UTC without losing its calendar day', () => {
    expect(normalizeCanvasSnapshot(snapshot()).academicItems[0]).toMatchObject({
      externalId: '2', courseExternalId: '1', kind: 'assignment', due: { kind: 'instant', at: '2026-03-08T07:00:00.000Z' }, submissionState: 'unsubmitted',
    });
  });
  it.each([null, undefined])('retains an absent due date %s without inventing a time', due_at => {
    expect(normalizeCanvasSnapshot(snapshot({ ...assignment, due_at })).academicItems[0].due).toBeNull();
  });
  it.each(['bad', '2026-02-30T12:00:00Z', '2026-03-08', '2026-03-08T12:00:00', '2026-03-08T12:00:00+99:00'])('rejects invalid due instant %s', due_at => {
    expect(() => normalizeCanvasSnapshot(snapshot({ ...assignment, due_at }))).toThrow();
  });
  it.each([
    [{ workflow_state: 'graded', score: 0 }, 'graded'],
    [{ workflow_state: 'submitted' }, 'submitted'],
    [{ workflow_state: 'pending_review' }, 'submitted'],
    [{ workflow_state: 'unsubmitted', missing: true }, 'missing'],
    [{ workflow_state: 'unsubmitted' }, 'unsubmitted'],
  ])('maps student submission %j to %s', (submission, expected) => {
    expect(normalizeCanvasSnapshot(snapshot({ ...assignment, submission })).academicItems[0].submissionState).toBe(expected);
  });
  it('does not use another student submitting as this student completing work', () => {
    expect(normalizeCanvasSnapshot(snapshot({ ...assignment, has_submitted_submissions: true, missing_submissions: true })).academicItems[0].submissionState).toBe('unsubmitted');
  });
  it.each([['discussion_topic', 'discussion'], ['online_quiz', 'quiz']])('maps %s to %s', (type, expected) => {
    expect(normalizeCanvasSnapshot(snapshot({ ...assignment, submission_types: [type] })).academicItems[0].kind).toBe(expected);
  });
  it('rejects duplicate identities, dangling course references and incomplete normalized batches', () => {
    const batch = normalizeCanvasSnapshot(snapshot());
    for (const invalid of [
      { ...batch, courses: [...batch.courses, ...batch.courses] },
      { ...batch, academicItems: [...batch.academicItems, ...batch.academicItems] },
      { ...batch, courses: [] }, { ...batch, status: 'incomplete' },
    ]) expect(academicSnapshotSchema.safeParse(invalid).success).toBe(false);
  });
  it('rejects a complete raw batch containing one malformed record', () => {
    expect(() => normalizeCanvasSnapshot({ courses: [{ course, assignments: [assignment, { ...assignment, id: '2' }] }] })).toThrow();
  });
  it('bounds courses and normalized records, and distinguishes a complete empty batch', () => {
    expect(normalizeCanvasSnapshot({ courses: [] })).toEqual({ status: 'complete', courses: [], academicItems: [] });
    expect(() => normalizeCanvasSnapshot({ courses: Array(201).fill({ course, assignments: [] }) })).toThrow();
    const batch = normalizeCanvasSnapshot(snapshot());
    expect(academicSnapshotSchema.safeParse({ ...batch, academicItems: Array(2001).fill(batch.academicItems[0]) }).success).toBe(false);
  });
  it('keeps the deterministic fixture independent of network availability', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    try {
      expect(await new FixtureCanvasProvider().fetchAcademicSnapshot()).toMatchObject({ status: 'complete', courses: [{ externalId: '91001' }, { externalId: '91002' }] });
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});
