/**
 * One weighted assessment of a course. `score` is a percentage, null until graded.
 * Without a group, `weight` is a percent of the course; in a group it is the
 * assessment's share of that group (Canvas uses points possible).
 */
export type Assessment = { id: string; title: string; weight: number; score: number | null; groupId?: string | null };
/** Assessments sharing one course weight. A null weight shares what explicit weights leave, by assessment weight. */
export type AssessmentGroup = { id: string; title: string; weight: number | null };

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

type Layout = { group: (row: Assessment) => AssessmentGroup | undefined; totals: Map<string, number>; pooled: number; leftover: number };
function layout(assessments: readonly Assessment[], groups: readonly AssessmentGroup[]): Layout {
  const byId = new Map(groups.map(group => [group.id, group]));
  // An assessment naming a group that doesn't exist counts as ungrouped.
  const group = (row: Assessment) => row.groupId ? byId.get(row.groupId) : undefined;
  const totals = new Map<string, number>();
  let explicit = 0, pooled = 0;
  for (const row of assessments) {
    const owner = group(row);
    if (owner) totals.set(owner.id, (totals.get(owner.id) ?? 0) + row.weight); else explicit += row.weight;
  }
  // Only groups with something in them claim their weight.
  for (const owner of groups) {
    const total = totals.get(owner.id) ?? 0;
    if (total > 0) { if (owner.weight === null) pooled += total; else explicit += owner.weight; }
  }
  return { group, totals, pooled, leftover: Math.max(0, 100 - explicit) };
}

/**
 * Each assessment with its weight as a percent of the course. A weighted group
 * splits its weight by share; points-based (null-weight) groups together split
 * whatever ungrouped assessments and weighted groups leave of 100%.
 */
export function courseWeights(assessments: readonly Assessment[], groups: readonly AssessmentGroup[] = []): Assessment[] {
  const { group, totals, pooled, leftover } = layout(assessments, groups);
  return assessments.map(row => {
    const owner = group(row);
    if (!owner) return row;
    const total = totals.get(owner.id) ?? 0;
    const weight = total <= 0 ? 0 : owner.weight === null ? (pooled > 0 ? leftover * row.weight / pooled : 0) : owner.weight * row.weight / total;
    return { ...row, weight };
  });
}

/**
 * The grade over graded work the way Canvas reports it: each group (and each
 * ungrouped assessment) is averaged over its own graded work, then the groups
 * that have grades are combined by their weights.
 */
function groupedCurrent(assessments: readonly Assessment[], groups: readonly AssessmentGroup[]): number | null {
  const { group, leftover } = layout(assessments, groups);
  const units = new Map<string, { weight: number; score: number; share: number }>();
  for (const row of assessments) {
    if (row.score === null || row.weight <= 0) continue;
    const owner = group(row);
    const key = !owner ? `row:${row.id}` : owner.weight === null ? 'pool' : `group:${owner.id}`;
    const unit = units.get(key) ?? { weight: !owner ? row.weight : owner.weight ?? leftover, score: 0, share: 0 };
    unit.score += row.weight * row.score; unit.share += row.weight;
    units.set(key, unit);
  }
  let weight = 0, total = 0;
  for (const unit of units.values()) if (unit.weight > 0) { weight += unit.weight; total += unit.weight * unit.score / unit.share; }
  return weight > 0 ? round(total / weight) : null;
}

/**
 * Weighted grade arithmetic. Weights need not sum to 100; floor/ceiling/needed are
 * expressed against the actual total weight so an incomplete outline is never
 * reported as a failing grade. Results are rounded to one decimal place.
 * With groups, assessments are first converted to course weights (`courseWeights`).
 */
export function gradeSummary(assessments: readonly Assessment[], target: number | null = null, groups: readonly AssessmentGroup[] = []): GradeSummary {
  const grouped = groups.length > 0 && assessments.some(row => row.groupId && groups.some(group => group.id === row.groupId));
  const rows = grouped ? courseWeights(assessments, groups) : assessments;
  const exactTotal = rows.reduce((sum, row) => sum + row.weight, 0);
  const graded = rows.filter(row => row.score !== null);
  const exactGraded = graded.reduce((sum, row) => sum + row.weight, 0), exactRemaining = exactTotal - exactGraded;
  // Group shares are fractions; report weights to one decimal so 99.99…% reads as 100%.
  const totalWeight = grouped ? round(exactTotal) : exactTotal, gradedWeight = grouped ? round(exactGraded) : exactGraded;
  const remainingWeight = grouped ? round(exactRemaining) : exactRemaining;
  const earned = graded.reduce((sum, row) => sum + row.weight * (row.score as number) / 100, 0);
  const current = grouped ? groupedCurrent(assessments, groups) : exactGraded > 0 ? round(earned / exactGraded * 100) : null;
  const floor = exactTotal > 0 ? round(earned / exactTotal * 100) : null;
  const ceiling = exactTotal > 0 ? round((earned + exactRemaining) / exactTotal * 100) : null;
  if (target === null || exactTotal <= 0) return { totalWeight, gradedWeight, remainingWeight, current, earned: round(earned), floor, ceiling, needed: null, status: 'noTarget' };
  if (exactRemaining <= 1e-9) return { totalWeight, gradedWeight, remainingWeight, current, earned: round(earned), floor, ceiling, needed: null, status: 'final' };
  const needed = round((target / 100 * exactTotal - earned) / exactRemaining * 100);
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
export function whatIfSummary(assessments: readonly Assessment[], scores: WhatIfScores, target: number | null = null, groups: readonly AssessmentGroup[] = []): WhatIfSummary {
  let tried = 0;
  const applied = assessments.map(row => {
    const value = scores[row.id];
    if (row.score !== null || value === undefined || !Number.isFinite(value) || value < 0 || value > whatIfScoreMax) return row;
    tried += 1;
    return { ...row, score: round(value) };
  });
  return { ...gradeSummary(applied, target, groups), tried, untried: applied.filter(row => row.score === null).length };
}
