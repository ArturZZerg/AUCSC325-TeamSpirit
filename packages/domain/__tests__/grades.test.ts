import { courseWeights, gradeSummary, whatIfSummary } from '../src';

const a = (weight: number, score: number | null, id = `${weight}-${score}`) => ({ id, title: id, weight, score });

describe('weighted grade summary', () => {
  it('averages graded work only and reports what is needed on the rest', () => {
    // Midterm 30% at 80, assignments 20% at 90; final 50% outstanding.
    const summary = gradeSummary([a(30, 80), a(20, 90), a(50, null)], 85);
    expect(summary).toMatchObject({ totalWeight: 100, gradedWeight: 50, remainingWeight: 50, current: 84, earned: 42, floor: 42, ceiling: 92, needed: 86, status: 'reachable' });
  });
  it('reports secured and unreachable targets without negative or impossible needs', () => {
    expect(gradeSummary([a(80, 100), a(20, null)], 70)).toMatchObject({ needed: 0, status: 'secured' });
    expect(gradeSummary([a(80, 40), a(20, null)], 70)).toMatchObject({ needed: 190, status: 'unreachable', ceiling: 52 });
  });
  it('handles a finished course, no target, and nothing graded yet', () => {
    expect(gradeSummary([a(40, 70), a(60, 90)], 80)).toMatchObject({ current: 82, needed: null, status: 'final' });
    expect(gradeSummary([a(50, null), a(50, null)])).toMatchObject({ current: null, floor: 0, ceiling: 100, status: 'noTarget' });
    expect(gradeSummary([a(50, null), a(50, null)], 75)).toMatchObject({ needed: 75, status: 'reachable' });
    expect(gradeSummary([], 80)).toMatchObject({ totalWeight: 0, current: null, floor: null, needed: null, status: 'noTarget' });
  });
  it('uses the actual total when weights do not sum to 100 and rounds to one decimal', () => {
    // Only 60% of the outline entered: a 75 on the 40% part is 75 overall so far, not 30.
    expect(gradeSummary([a(40, 75), a(20, null)], 80)).toMatchObject({ totalWeight: 60, current: 75, floor: 50, ceiling: 83.3, needed: 90, status: 'reachable' });
    expect(gradeSummary([a(33, 67), a(33, null), a(34, null)], 70)).toMatchObject({ current: 67, needed: 71.5 });
  });
  it('treats a zero score as graded', () => {
    expect(gradeSummary([a(10, 0), a(90, null)], 50)).toMatchObject({ current: 0, gradedWeight: 10, needed: 55.6 });
  });
});

describe('what-if grade summary', () => {
  // Midterm 30% at 80, essays 20% at 90; quiz 10% and final 40% outstanding.
  const outline = [a(30, 80, 'midterm'), a(20, 90, 'essays'), a(10, null, 'quiz'), a(40, null, 'final')];

  it('projects the final grade once every remaining assessment has a hypothetical score', () => {
    // 24 + 18 + 7 + 30 = 79.
    expect(whatIfSummary(outline, { quiz: 70, final: 75 }, 80)).toMatchObject({ status: 'final', floor: 79, current: 79, tried: 2, untried: 0 });
  });
  it('recalculates what is needed on the rest after a partial guess', () => {
    // Before: 42 earned, needs 76% on the remaining 50% for 80. A 100 on the quiz leaves 28 needed from the final's 40.
    expect(whatIfSummary(outline, {}, 80)).toMatchObject({ needed: 76, remainingWeight: 50, tried: 0, untried: 2 });
    expect(whatIfSummary(outline, { quiz: 100 }, 80)).toMatchObject({ needed: 70, remainingWeight: 40, current: 86.7, status: 'reachable', tried: 1, untried: 1 });
    expect(whatIfSummary(outline, { quiz: 0 }, 80)).toMatchObject({ needed: 95, status: 'reachable' });
    expect(whatIfSummary(outline, { quiz: 0 }, 90)).toMatchObject({ status: 'unreachable', ceiling: 82 });
  });
  it('never overrides a recorded score and ignores unknown ids', () => {
    expect(whatIfSummary(outline, { midterm: 0, nope: 100 }, 80)).toEqual({ ...gradeSummary(outline, 80), tried: 0, untried: 2 });
  });
  it('ignores out-of-range and non-finite guesses but accepts bonus marks up to 150', () => {
    expect(whatIfSummary(outline, { quiz: -1, final: Number.NaN })).toMatchObject({ tried: 0, untried: 2 });
    expect(whatIfSummary(outline, { quiz: 151 })).toMatchObject({ tried: 0 });
    expect(whatIfSummary(outline, { quiz: 150, final: 100 })).toMatchObject({ tried: 2, status: 'noTarget', floor: 97 });
  });
  it('rounds guesses to one decimal like recorded scores', () => {
    expect(whatIfSummary([a(50, null, 'x'), a(50, 80, 'y')], { x: 66.66 })).toMatchObject({ current: 73.4, floor: 73.4 });
  });
});

describe('assessment groups', () => {
  const g = (id: string, weight: number | null) => ({ id, title: id, weight });
  const in_ = (group: string, weight: number, score: number | null, id: string) => ({ id, title: id, weight, score, groupId: group });
  // Weighted like a Canvas course with group weights: assignments 40%, quizzes 20%, exams 40%.
  const weighted = [g('assignments', 40), g('quizzes', 20), g('exams', 40)];
  const work = [in_('assignments', 10, 90, 'a1'), in_('assignments', 10, null, 'a2'), in_('quizzes', 5, 80, 'q1'), in_('quizzes', 5, 100, 'q2'),
    in_('exams', 100, 70, 'midterm'), in_('exams', 100, null, 'final')];

  it('splits each group weight by share', () => {
    expect(courseWeights(work, weighted).map(row => row.weight)).toEqual([20, 20, 10, 10, 20, 20]);
  });
  it('reports the current grade group by group, like Canvas, and the rest against course weights', () => {
    // Groups average 90, 90 and 70: (40×90 + 20×90 + 40×70) / 100 = 82, not the 83.3 a flat average of graded weight gives.
    expect(gradeSummary(work, 80, weighted)).toMatchObject({ totalWeight: 100, gradedWeight: 60, remainingWeight: 40, current: 82, earned: 50,
      floor: 50, ceiling: 90, needed: 75, status: 'reachable' });
  });
  it('leaves groups without grades out of the current grade', () => {
    expect(gradeSummary([in_('assignments', 10, 90, 'a1'), in_('exams', 100, null, 'final')], null, weighted)).toMatchObject({ current: 90, totalWeight: 80 });
  });
  it('treats points-based groups as one pool sharing the course, like an unweighted Canvas course', () => {
    const points = [g('labs', null), g('exam', null)];
    const rows = [in_('labs', 20, 90, 'l1'), in_('labs', 20, null, 'l2'), in_('exam', 60, 50, 'e')];
    expect(courseWeights(rows, points).map(row => row.weight)).toEqual([20, 20, 60]);
    expect(gradeSummary(rows, null, points)).toMatchObject({ current: 60, floor: 48, ceiling: 68, totalWeight: 100 });
  });
  it('gives points-based groups what ungrouped and weighted parts leave', () => {
    // Participation 20% by hand, the rest from an unweighted Canvas group.
    const rows = [a(20, 100, 'participation'), in_('canvas', 50, 80, 'x'), in_('canvas', 50, null, 'y')];
    expect(courseWeights(rows, [g('canvas', null)]).map(row => row.weight)).toEqual([20, 40, 40]);
    expect(gradeSummary(rows, null, [g('canvas', null)])).toMatchObject({ current: 84, floor: 52, ceiling: 92 });
  });
  it('ignores zero weights and empty groups, and counts unknown groups as ungrouped', () => {
    const rows = [in_('assignments', 0, 0, 'practice'), in_('assignments', 10, 80, 'a1'), a(10, 50, 'orphan')];
    const withOrphan = [...rows.slice(0, 2), { ...rows[2], groupId: 'gone' }];
    // Quizzes and exams are empty, so they claim nothing; the orphan counts as an ungrouped 10%.
    expect(courseWeights(withOrphan, weighted).map(row => row.weight)).toEqual([0, 40, 10]);
    expect(gradeSummary(withOrphan, null, weighted)).toMatchObject({ totalWeight: 50, current: 74 });
    expect(gradeSummary([in_('quizzes', 5, 90, 'q')], null, [g('quizzes', 0)])).toMatchObject({ totalWeight: 0, current: null, status: 'noTarget' });
  });
  it('reports fractional shares to one decimal so a full outline reads as 100%', () => {
    const thirds = [in_('exams', 1, 70, 'x'), in_('exams', 1, null, 'y'), in_('exams', 1, null, 'z')];
    expect(gradeSummary(thirds, 70, [g('exams', 100)])).toMatchObject({ totalWeight: 100, gradedWeight: 33.3, remainingWeight: 66.7, needed: 70, current: 70 });
  });
  it('projects what-if scores through groups', () => {
    // Assignments 95, quizzes 90, exams 80: (3800 + 1800 + 3200) / 100.
    expect(whatIfSummary(work, { a2: 100, final: 90 }, 85, weighted)).toMatchObject({ status: 'final', floor: 88, current: 88, tried: 2, untried: 0 });
  });
  it('keeps ungrouped courses exactly as before', () => {
    const plain = [a(30, 80), a(20, 90), a(50, null)];
    expect(gradeSummary(plain, 85, [g('unused', 50)])).toEqual(gradeSummary(plain, 85));
  });
});
