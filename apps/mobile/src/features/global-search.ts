import type { AcademicItem, CampusEvent, Course, Goal, PersonalTask } from '@/lib/types';

export type SearchKind = 'task' | 'coursework' | 'course' | 'routine' | 'event';
export type SearchResult = { key: string; kind: SearchKind; id: string; title: string; detail: string; score: number; done: boolean };
export type SearchSources = { tasks?: readonly PersonalTask[]; academic?: readonly AcademicItem[]; courses?: readonly Course[]; goals?: readonly Goal[]; events?: readonly CampusEvent[] };

const normalize = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Every query word must appear somewhere; title matches and word starts rank higher. */
function rank(words: string[], title: string, extra: readonly (string | null | undefined)[]) {
  const head = normalize(title), rest = normalize(extra.filter(Boolean).join(' '));
  let score = 0;
  for (const word of words) {
    const index = head.indexOf(word);
    if (index >= 0) score += index === 0 ? 6 : /\W/.test(head[index - 1] ?? ' ') ? 4 : 3;
    else if (rest.includes(word)) score += 1;
    else return 0;
  }
  return score;
}

/**
 * Searches the lists already cached on the device. Unavailable lists are simply
 * skipped; `missing` names them so the screen can say results may be incomplete.
 */
export function searchEverything(query: string, sources: SearchSources, limit = 40) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const missing = (['tasks', 'academic', 'courses', 'goals', 'events'] as const).filter(name => sources[name] === undefined);
  if (!words.length) return { results: [] as SearchResult[], missing };
  const courseName = new Map(sources.courses?.map(course => [course.id, course.code ?? course.name]) ?? []);
  const courseText = new Map(sources.courses?.map(course => [course.id, `${course.name} ${course.code ?? ''}`]) ?? []);
  const results: SearchResult[] = [];
  const push = (result: Omit<SearchResult, 'score' | 'key'>, score: number) => { if (score) results.push({ ...result, key: `${result.kind}:${result.id}`, score }); };
  for (const task of sources.tasks ?? []) push({ kind: 'task', id: task.id, title: task.title, done: !!task.completedAt,
    detail: [task.category[0].toUpperCase() + task.category.slice(1), task.checklist?.length ? `${task.checklist.filter(step => step.done).length}/${task.checklist.length} steps` : null].filter(Boolean).join(' · ') },
  rank(words, task.title, [task.description, task.category, ...(task.checklist ?? []).map(step => step.title)]));
  for (const item of sources.academic ?? []) push({ kind: 'coursework', id: item.id, title: item.title, done: item.submissionState === 'submitted' || item.submissionState === 'graded',
    detail: [item.kind === 'exam' ? 'Exam' : item.kind[0].toUpperCase() + item.kind.slice(1), item.courseId ? courseName.get(item.courseId) : null].filter(Boolean).join(' · ') },
  rank(words, item.title, [item.kind, item.courseId ? courseText.get(item.courseId) : null]));
  for (const course of sources.courses ?? []) push({ kind: 'course', id: course.id, title: course.name, done: !course.active,
    detail: [course.code, course.active ? null : 'Archived'].filter(Boolean).join(' · ') || 'Course' }, rank(words, course.name, [course.code]));
  for (const goal of sources.goals ?? []) push({ kind: 'routine', id: goal.id, title: goal.title, done: !!goal.pausedAt,
    detail: goal.pausedAt ? 'Routine · Paused' : 'Routine' }, rank(words, goal.title, [goal.category]));
  for (const event of sources.events ?? []) push({ kind: 'event', id: event.id, title: event.title, done: false,
    detail: [event.saved ? 'Saved event' : 'Campus event', event.location].filter(Boolean).join(' · ') }, rank(words, event.title, [event.location, event.category, event.description]));
  results.sort((a, b) => b.score - a.score || Number(a.done) - Number(b.done) || a.title.localeCompare(b.title));
  return { results: results.slice(0, limit), missing };
}
