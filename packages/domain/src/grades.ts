/** One weighted assessment of a course. `score` is a percentage, null until graded. */
export type Assessment = { id: string; title: string; weight: number; score: number | null };

export type GradeSummary = {
  /** Sum of all weights, normally 100. */
  totalWeight: number;
  gradedWeight: number;
  remainingWeight: number;
  /** Weighted average over graded work only, or null before anything is graded. */
  current: number | null;
  /** Course percentage points already earned out of totalWeight. */
  earned: number;
  /** Final grade if every remaining assessment scores 0 or 100. */
  floor: number | null;
  ceiling: number | null;
  /** Average needed on remaining work to reach the target; null without a target or remaining work. */
  needed: number | null;
  status: 'noTarget' | 'secured' | 'reachable' | 'unreachable' | 'final';
};

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Weighted grade arithmetic. Weights need not sum to 100; floor/ceiling/needed are
 * expressed against the actual total weight so an incomplete outline is never
 * reported as a failing grade. Results are rounded to one decimal place.
 */
export function gradeSummary(assessments: readonly Assessment[], target: number | null = null): GradeSummary {
  const totalWeight = assessments.reduce((sum, row) => sum + row.weight, 0);
  const graded = assessments.filter(row => row.score !== null);
  const gradedWeight = graded.reduce((sum, row) => sum + row.weight, 0), remainingWeight = totalWeight - gradedWeight;
  const earned = graded.reduce((sum, row) => sum + row.weight * (row.score as number) / 100, 0);
  const current = gradedWeight > 0 ? round(earned / gradedWeight * 100) : null;
  const floor = totalWeight > 0 ? round(earned / totalWeight * 100) : null;
  const ceiling = totalWeight > 0 ? round((earned + remainingWeight) / totalWeight * 100) : null;
  if (target === null || totalWeight === 0) return { totalWeight, gradedWeight, remainingWeight, current, earned: round(earned), floor, ceiling, needed: null, status: 'noTarget' };
  if (remainingWeight === 0) return { totalWeight, gradedWeight, remainingWeight, current, earned: round(earned), floor, ceiling, needed: null, status: 'final' };
  const needed = round((target / 100 * totalWeight - earned) / remainingWeight * 100);
  const status = needed <= 0 ? 'secured' : needed > 100 ? 'unreachable' : 'reachable';
  return { totalWeight, gradedWeight, remainingWeight, current, earned: round(earned), floor, ceiling, needed: Math.max(0, needed), status };
}

/** Hypothetical percentage scores keyed by assessment id. Never saved. */
export type WhatIfScores = Readonly<Record<string, number>>;
export const whatIfScoreMax = 150;

export type WhatIfSummary = GradeSummary & {
  /** Ungraded assessments given a usable hypothetical score. */
  tried: number;
  /** Ungraded assessments still without one. */
  untried: number;
};

/**
 * The grade summary as if each ungraded assessment scored its hypothetical value.
 * Real scores always win, and out-of-range values are ignored, so a stale or
 * mistyped entry can't change a recorded grade. When every remaining assessment
 * is tried the status is 'final' and `floor` is the projected final grade.
 */
export function whatIfSummary(assessments: readonly Assessment[], scores: WhatIfScores, target: number | null = null): WhatIfSummary {
  let tried = 0;
  const applied = assessments.map(row => {
    const value = scores[row.id];
    if (row.score !== null || value === undefined || !Number.isFinite(value) || value < 0 || value > whatIfScoreMax) return row;
    tried += 1;
    return { ...row, score: round(value) };
  });
  return { ...gradeSummary(applied, target), tried, untried: applied.filter(row => row.score === null).length };
}
