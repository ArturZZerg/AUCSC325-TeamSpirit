import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { assessmentGroupSchema, assessmentSchema } from '@campusflow/contracts';

// Course grade rules shared by the course endpoints and Canvas sync (ADR 016, ADR 024).

export type AssessmentRow = z.infer<typeof assessmentSchema>;
export type GroupRow = z.infer<typeof assessmentGroupSchema>;
export type Grades = { assessments: AssessmentRow[]; groups: GroupRow[] };

export function readGrades(course: { assessments: unknown; assessmentGroups: unknown }): Grades {
  return { assessments: z.array(assessmentSchema).parse(course.assessments ?? []), groups: z.array(assessmentGroupSchema).parse(course.assessmentGroups ?? []) };
}

/** Percent of the course claimed outright: ungrouped assessments plus weighted groups. */
export function explicitWeight({ assessments, groups }: Grades): number {
  return assessments.filter(row => !row.groupId).reduce((sum, row) => sum + row.weight, 0) + groups.reduce((sum, group) => sum + (group.weight ?? 0), 0);
}

/** Rejects a change that would leave a course's grade outline inconsistent. */
export function checkGrades(next: Grades, previous: Grades): void {
  const groups = new Set(next.groups.map(group => group.id));
  for (const row of next.assessments) {
    if (row.groupId && !groups.has(row.groupId)) throw new BadRequestException('That assessment group doesn’t exist.');
    if (!row.groupId && row.weight <= 0) throw new BadRequestException('Enter a weight above 0%.');
    if (!row.groupId && row.weight > 100) throw new BadRequestException('Enter a weight of 100% or less.');
  }
  // Canvas may import group weights above 100%. Only refuse edits that add to an over-full outline.
  const total = explicitWeight(next);
  if (total > 100.0001 && total > explicitWeight(previous) + 0.0001)
    throw new BadRequestException(`Assessment weights would total ${Math.round(total * 10) / 10}%. Keep the total at or below 100%.`);
}

/** Sets or clears an optional group without leaving a `groupId: undefined` key behind. */
export function withGroup<T extends { groupId?: string | null }>(row: T, groupId: string | null | undefined): T {
  if (groupId === undefined) return row;
  const { groupId: _previous, ...rest } = row;
  return (groupId ? { ...rest, groupId } : rest) as T;
}
