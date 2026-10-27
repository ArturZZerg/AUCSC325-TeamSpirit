import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assessmentGroupLimit, courseAssessmentMax } from '@campusflow/contracts';
import type { AssessmentRow, Grades, GroupRow } from '../../course-grades';
import type { CanvasCourseGrades } from './canvas-provider';

/**
 * Brings a course's Canvas assessments and groups up to date (ADR 024).
 * Canvas sets titles, scores, groups and default weights; a weight the student
 * edited is kept. Rows the student added are never touched. Canvas rows missing
 * from a complete read were removed in Canvas and are dropped; after a partial
 * read they stay. Returns the same object when nothing changed.
 */
export function mergeCanvasGrades(current: Grades, canvas: CanvasCourseGrades, newId: () => string = randomUUID): Grades {
  const oldGroups = new Map(current.groups.flatMap(group => group.canvas ? [[group.canvas.externalId, group] as const] : []));
  const oldRows = new Map(current.assessments.flatMap(row => row.canvas ? [[row.canvas.externalId, row] as const] : []));
  const nextGroups = new Map<string, GroupRow>();
  for (const incoming of canvas.groups) {
    const existing = oldGroups.get(incoming.externalId), edited = existing?.canvas?.weightEdited === true;
    nextGroups.set(incoming.externalId, { id: existing?.id ?? newId(), title: incoming.name, weight: edited ? existing.weight : incoming.weight,
      canvas: { externalId: incoming.externalId, weight: incoming.weight, weightEdited: edited } });
  }
  const nextRows = new Map<string, AssessmentRow>();
  for (const incoming of canvas.items) {
    const group = nextGroups.get(incoming.groupExternalId), existing = oldRows.get(incoming.externalId), edited = existing?.canvas?.weightEdited === true;
    if (!group) continue;
    nextRows.set(incoming.externalId, { id: existing?.id ?? newId(), title: incoming.title, weight: edited ? existing.weight : incoming.pointsPossible,
      score: incoming.score, groupId: group.id, canvas: { externalId: incoming.externalId, pointsPossible: incoming.pointsPossible, weightEdited: edited } });
  }
  // Existing rows keep their place; new Canvas rows follow in Canvas order.
  const assessments: AssessmentRow[] = [];
  for (const row of current.assessments) {
    if (!row.canvas) { assessments.push(row); continue; }
    const updated = nextRows.get(row.canvas.externalId);
    if (updated) { assessments.push(updated); nextRows.delete(row.canvas.externalId); } else if (!canvas.complete) assessments.push(row);
  }
  assessments.push(...nextRows.values());
  const used = new Set(assessments.map(row => row.groupId).filter(Boolean));
  const groups: GroupRow[] = [];
  for (const group of current.groups) {
    if (!group.canvas) { groups.push(group); continue; }
    const updated = nextGroups.get(group.canvas.externalId);
    // A Canvas group gone from Canvas stays while assessments still point at it.
    if (updated) { groups.push(updated); nextGroups.delete(group.canvas.externalId); } else if (!canvas.complete || used.has(group.id)) groups.push(group);
  }
  groups.push(...nextGroups.values());
  const keptGroups = groups.slice(0, assessmentGroupLimit), groupIds = new Set(keptGroups.map(group => group.id));
  const next = { assessments: assessments.filter(row => !row.groupId || groupIds.has(row.groupId)).slice(0, courseAssessmentMax), groups: keptGroups };
  // JSONB reorders keys, so compare structurally rather than as text.
  return isDeepStrictEqual(next, current) ? current : next;
}
