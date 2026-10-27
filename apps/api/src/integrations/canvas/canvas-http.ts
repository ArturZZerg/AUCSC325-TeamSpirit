import { Injectable } from '@nestjs/common';
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { z } from 'zod';
import { dateSchema } from '@campusflow/contracts';
import { addCalendarDays, dayBounds } from '@campusflow/domain';
import { AcademicSnapshot, maxPlannerItems, normalizeCanvasSnapshot } from './canvas-provider';
import { EventCoverage, ImportedEvent, importedEventSchema } from '../events/event-provider';

// Live Canvas REST access with a student's personal access token (ADR 019).
// Only this module sees Canvas JSON; it returns the normalized snapshot.

export type CanvasFailure = 'invalid-url' | 'unauthorized' | 'unreachable' | 'invalid-response';
export class CanvasRequestError extends Error {
  constructor(readonly kind: CanvasFailure) { super(`Canvas request failed: ${kind}`); }
}

const blocked = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 127], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const)
  blocked.addSubnet(network, prefix, 'ipv6');

/**
 * Accepts "school.instructure.com" or a pasted Canvas page URL and returns the
 * HTTPS origin. Literal addresses, local names and non-default ports are refused
 * because the API fetches this address on the student's behalf.
 */
export function canvasOrigin(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`); } catch { throw new CanvasRequestError('invalid-url'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(host.replace(/^\[|\]$/g, ''))
    || !/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
    || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal')) throw new CanvasRequestError('invalid-url');
  return `https://${host}`;
}

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
export interface CanvasHttpDeps { fetch: typeof fetch; lookup: Lookup }
const defaultDeps: CanvasHttpDeps = { fetch: (...args) => fetch(...args), lookup: host => dnsLookup(host, { all: true, verbatim: true }) };

async function assertPublicHost(origin: string, lookup: Lookup) {
  let addresses: { address: string; family: number }[];
  try { addresses = await lookup(new URL(origin).hostname); } catch { throw new CanvasRequestError('unreachable'); }
  // An IPv4-mapped IPv6 address is checked as the IPv4 address it carries.
  const isBlocked = ({ address, family }: { address: string; family: number }) => {
    const mapped = family === 6 && /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    return mapped ? blocked.check(mapped[1], 'ipv4') : blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
  };
  if (!addresses.length || addresses.some(isBlocked))
    throw new CanvasRequestError('invalid-url');
}

const userSchema = z.object({ id: z.number().int().positive().safe(), name: z.string().optional() });
const courseSchema = z.object({ id: z.number().int().positive().safe(), name: z.string().optional(), course_code: z.string().nullable().optional(),
  workflow_state: z.string().optional(), access_restricted_by_date: z.boolean().optional(), apply_assignment_group_weights: z.boolean().nullable().optional() });
const submissionStates = ['unsubmitted', 'submitted', 'pending_review', 'graded'] as const;
const assignmentSchema = z.object({ id: z.number().int().positive().safe(), name: z.string().optional(), due_at: z.string().nullable().optional(),
  submission_types: z.array(z.string()).optional(),
  submission: z.object({ submitted_at: z.string().nullable().optional(), workflow_state: z.string().optional(),
    score: z.number().nullable().optional(), missing: z.boolean().optional(), excused: z.boolean().nullable().optional() }).nullable().optional(),
  points_possible: z.number().nullable().optional(), assignment_group_id: z.number().int().positive().safe().nullable().optional(),
  omit_from_final_grade: z.boolean().nullable().optional(), grading_type: z.string().optional() });
const groupSchema = z.object({ id: z.number().int().positive().safe(), name: z.string().optional(), group_weight: z.number().nullable().optional() });

const maxCourses = 60, maxAssignments = 2000, maxAssignmentsPerCourse = 400, maxPages = 10, courseConcurrency = 4;
const clip = (value: string, length: number) => value.length > length ? `${value.slice(0, length - 1)}…` : value;

const plannerTypes = ['wiki_page', 'discussion_topic', 'planner_note'] as const;
const plannerSchema = z.object({ plannable_id: z.number().int().positive().safe(), plannable_type: z.string(), course_id: z.number().int().positive().safe().nullable().optional(),
  plannable_date: z.string().nullable().optional(),
  plannable: z.object({ title: z.string().optional(), todo_date: z.string().nullable().optional(), assignment_id: z.number().nullable().optional() }).nullable().optional(),
  planner_override: z.object({ marked_complete: z.boolean().nullable().optional() }).nullable().optional() });
type PlannerRow = { id: number; type: (typeof plannerTypes)[number]; title: string; todo_at: string | null; marked_complete: boolean };
const calendarSchema = z.object({ id: z.number().int().positive().safe(), title: z.string().nullable().optional(), start_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(), all_day: z.boolean().nullable().optional(), all_day_date: z.string().nullable().optional(),
  location_name: z.string().nullable().optional(), description: z.string().nullable().optional(), html_url: z.string().nullable().optional(),
  context_code: z.string().nullable().optional(), workflow_state: z.string().nullable().optional(), hidden: z.boolean().nullable().optional() });
const maxCalendarEvents = 1000, calendarContextsPerRequest = 10;
const utc = (value: string | null | undefined) => value && z.string().datetime({ offset: true }).safeParse(value).success ? new Date(value).toISOString() : null;

/** Canvas descriptions are HTML; keep readable text only. */
export function plainText(html: string | null | undefined, length: number): string | null {
  if (!html) return null;
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/ *\n[\s]*/g, '\n').trim();
  return text ? clip(text, length) : null;
}

/** A Canvas calendar event as a private CampusFlow event; null to skip, 'invalid' when it can't be read. */
function calendarEvent(row: z.infer<typeof calendarSchema>, origin: string, courses: Map<number, z.infer<typeof courseSchema>>): ImportedEvent | null | 'invalid' {
  if (row.workflow_state === 'deleted' || row.hidden) return null;
  const title = row.title?.trim();
  if (!title) return 'invalid';
  const course = courses.get(Number(row.context_code?.replace(/^course_/, '')));
  let url: string | null = null;
  // Only links back to the student's own Canvas are kept.
  try { const parsed = row.html_url ? new URL(row.html_url, origin) : null; url = parsed?.origin === origin ? parsed.toString() : null; } catch { url = null; }
  const base = { externalId: String(row.id), title: clip(title, 240), description: plainText(row.description, 2000),
    category: course?.name?.trim() ? clip(course.name.trim(), 120) : null, location: row.location_name?.trim() ? clip(row.location_name.trim(), 240) : null, url };
  const date = row.all_day && row.all_day_date && dateSchema.safeParse(row.all_day_date).success ? row.all_day_date : null;
  const startsAt = utc(row.start_at), endsAt = utc(row.end_at);
  const event = date ? { ...base, timing: { kind: 'allDay' as const, startDate: date, endDateExclusive: addCalendarDays(date, 1) } }
    : startsAt ? { ...base, timing: { kind: 'timed' as const, startsAt, endsAt: endsAt && endsAt >= startsAt ? endsAt : null } } : null;
  return event && importedEventSchema.safeParse(event).success ? event : 'invalid';
}

function nextLink(header: string | null, origin: string): string | null {
  const match = header?.split(',').map(part => part.match(/<([^>]+)>\s*;\s*rel="next"/)).find(Boolean);
  if (!match) return null;
  // Pagination must stay on the verified Canvas origin.
  try { const next = new URL(match[1]); return next.origin === origin ? next.toString() : null; } catch { return null; }
}

@Injectable()
export class CanvasHttpClient {
  /** Replaced in tests; production uses global fetch and system DNS. */
  deps: CanvasHttpDeps = defaultDeps;

  private async getPages<T>(origin: string, token: string, path: string, schema: z.ZodType<T>, signal: AbortSignal, limit: number): Promise<T[] | 'forbidden'> {
    const pages = await this.getAllPages(origin, token, path, schema, signal, limit);
    return pages === 'forbidden' ? pages : pages.rows;
  }

  /** Like getPages, also saying whether the listing was read to its end without being cut off. */
  private async getAllPages<T>(origin: string, token: string, path: string, schema: z.ZodType<T>, signal: AbortSignal, limit: number): Promise<{ rows: T[]; complete: boolean } | 'forbidden'> {
    const results: T[] = [];
    let skipped = false;
    let url: string | null = `${origin}${path}`;
    for (let page = 0; url && page < maxPages && results.length < limit; page += 1) {
      let response: Response;
      try {
        response = await this.deps.fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal });
      } catch { throw new CanvasRequestError('unreachable'); }
      if (response.status === 401) throw new CanvasRequestError('unauthorized');
      // Course tabs can be hidden from students; that course is imported without coursework.
      if (response.status === 403 || response.status === 404) return 'forbidden';
      if (!response.ok) throw new CanvasRequestError('unreachable');
      const body: unknown = await response.json().catch(() => { throw new CanvasRequestError('invalid-response'); });
      const parsed = z.array(z.unknown()).safeParse(body);
      if (!parsed.success) throw new CanvasRequestError('invalid-response');
      for (const entry of parsed.data) { const item = schema.safeParse(entry); if (item.success) results.push(item.data); else skipped = true; }
      url = nextLink(response.headers.get('link'), origin);
    }
    // A skipped row or a remaining page could hide a record that still exists in Canvas.
    return { rows: results.slice(0, limit), complete: url === null && !skipped && results.length <= limit };
  }

  /** Confirms the token belongs to a Canvas user on this origin and returns that user's id. */
  async verify(baseUrl: string, token: string, signal: AbortSignal): Promise<{ origin: string; userId: string }> {
    const origin = canvasOrigin(baseUrl);
    await assertPublicHost(origin, this.deps.lookup);
    let response: Response;
    try {
      response = await this.deps.fetch(`${origin}/api/v1/users/self`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal });
    } catch { throw new CanvasRequestError('unreachable'); }
    if (response.status === 401 || response.status === 403) throw new CanvasRequestError('unauthorized');
    if (!response.ok) throw new CanvasRequestError(response.status === 404 ? 'invalid-url' : 'unreachable');
    const user = userSchema.safeParse(await response.json().catch(() => null));
    if (!user.success) throw new CanvasRequestError('invalid-url');
    return { origin, userId: String(user.data.id) };
  }

  /**
   * The student's planner to-dos and course calendar events in `window` (ADR 025). Graded
   * to-dos are skipped because they already arrive as assignments. Each part says whether
   * it was read in full, which is what allows removing records missing from it.
   */
  private async fetchPlanAndCalendar(origin: string, token: string, signal: AbortSignal, window: EventCoverage, courses: z.infer<typeof courseSchema>[]) {
    const from = dayBounds(window.from, window.timeZone).start, to = dayBounds(window.through, window.timeZone).start;
    const range = `start_date=${encodeURIComponent(from)}&end_date=${encodeURIComponent(to)}`;
    const known = new Map(courses.map(course => [course.id, course]));
    const planner = new Map<number, PlannerRow[]>();
    let plannerWindow: { from: string; to: string } | null = null;
    const plan = await this.getAllPages(origin, token, `/api/v1/planner/items?${range}&per_page=100`, plannerSchema, signal, maxPlannerItems);
    if (plan !== 'forbidden') {
      const seen = new Set<string>();
      for (const row of plan.rows) {
        const type = plannerTypes.find(value => value === row.plannable_type), title = row.plannable?.title?.trim();
        if (!type || row.plannable?.assignment_id || !title || row.course_id == null || !known.has(row.course_id) || seen.has(`${type}:${row.plannable_id}`)) continue;
        seen.add(`${type}:${row.plannable_id}`);
        const list = planner.get(row.course_id) ?? [];
        list.push({ id: row.plannable_id, type, title: clip(title, 240), todo_at: utc(row.plannable?.todo_date ?? row.plannable_date),
          marked_complete: row.planner_override?.marked_complete === true });
        planner.set(row.course_id, list);
      }
      if (plan.complete) plannerWindow = { from, to };
    }
    const events: ImportedEvent[] = [], seen = new Set<string>();
    let complete = true;
    for (let start = 0; start < courses.length; start += calendarContextsPerRequest) {
      const contexts = courses.slice(start, start + calendarContextsPerRequest).map(course => `context_codes[]=course_${course.id}`).join('&');
      const page = await this.getAllPages(origin, token, `/api/v1/calendar_events?type=event&${range}&per_page=100&${contexts}`, calendarSchema, signal, maxCalendarEvents - events.length);
      if (page === 'forbidden' || !page.complete) complete = false;
      if (page === 'forbidden') continue;
      for (const row of page.rows) {
        const event = calendarEvent(row, origin, known);
        if (event === 'invalid') { complete = false; continue; }
        if (event && !seen.has(event.externalId)) { seen.add(event.externalId); events.push(event); }
      }
      if (events.length >= maxCalendarEvents) { complete = false; break; }
    }
    return { planner, plannerWindow, calendar: { coverage: window, complete, events } };
  }

  /**
   * Active courses and their assignments with the current user's submission state, plus assignment groups for grades.
   * With a `window`, also the student's planner to-dos and course calendar events in it (ADR 025).
   */
  async fetchAcademicSnapshot(baseUrl: string, token: string, signal: AbortSignal, window?: EventCoverage): Promise<AcademicSnapshot> {
    const origin = canvasOrigin(baseUrl);
    await assertPublicHost(origin, this.deps.lookup);
    const courses = await this.getPages(origin, token, '/api/v1/courses?enrollment_state=active&per_page=100', courseSchema, signal, maxCourses);
    if (courses === 'forbidden') throw new CanvasRequestError('unauthorized');
    const visible = courses.filter(course => course.name?.trim() && !course.access_restricted_by_date && course.workflow_state !== 'deleted');
    const assignments = new Map<number, z.infer<typeof assignmentSchema>[]>();
    const groups = new Map<number, z.infer<typeof groupSchema>[]>();
    // A course counts as complete only when its assignments and groups were all read (ADR 024).
    const complete = new Set<number>();
    // Coursework is complete when every assignment was read, so one missing was removed in Canvas (ADR 025).
    const courseworkComplete = new Set<number>();
    for (let start = 0; start < visible.length; start += courseConcurrency) {
      await Promise.all(visible.slice(start, start + courseConcurrency).map(async course => {
        const [rows, sets] = await Promise.all([
          this.getAllPages(origin, token, `/api/v1/courses/${course.id}/assignments?include[]=submission&per_page=100&order_by=due_at`, assignmentSchema, signal, maxAssignmentsPerCourse),
          this.getAllPages(origin, token, `/api/v1/courses/${course.id}/assignment_groups?per_page=100`, groupSchema, signal, 100),
        ]);
        assignments.set(course.id, rows === 'forbidden' ? [] : rows.rows);
        groups.set(course.id, sets === 'forbidden' ? [] : sets.rows.filter(group => group.name?.trim()));
        if (rows !== 'forbidden' && rows.complete && rows.rows.every(row => row.name?.trim())) courseworkComplete.add(course.id);
        if (rows !== 'forbidden' && rows.complete && sets !== 'forbidden' && sets.complete && sets.rows.every(group => group.name?.trim())
          && rows.rows.every(row => row.name?.trim())) complete.add(course.id);
      }));
    }
    const instant = (value: string | null | undefined) => value && z.string().datetime({ offset: true }).safeParse(value).success ? value : null;
    // The import accepts 2,000 records. Past that, keep undated and recent work
    // first: long-finished assignments are the least useful in a daily plan.
    const all = [...assignments.values()].flat();
    if (all.length > maxAssignments) {
      const cutoff = Date.now() - 120 * 86_400_000;
      const keep = new Set(all.map(row => ({ id: row.id, due: instant(row.due_at) ? Date.parse(row.due_at!) : Infinity }))
        .sort((a, b) => (b.due >= cutoff ? 1 : 0) - (a.due >= cutoff ? 1 : 0) || a.due - b.due).slice(0, maxAssignments).map(row => row.id));
      for (const [id, rows] of assignments) {
        const kept = rows.filter(row => keep.has(row.id));
        if (kept.length < rows.length) { complete.delete(id); courseworkComplete.delete(id); }
        assignments.set(id, kept);
      }
    }
    const finite = (value: number | null | undefined) => Number.isFinite(value) ? value : null;
    const extra = window ? await this.fetchPlanAndCalendar(origin, token, signal, window, visible) : null;
    try {
      return normalizeCanvasSnapshot({ courses: visible.map(course => ({
        course: { id: course.id, name: clip(course.name!.trim(), 240), course_code: course.course_code ? clip(course.course_code, 240) : null,
          workflow_state: course.workflow_state === 'completed' ? 'completed' : 'available', apply_assignment_group_weights: course.apply_assignment_group_weights === true },
        assignments: (assignments.get(course.id) ?? []).filter(row => row.name?.trim()).map(row => ({
          id: row.id, name: clip(row.name!.trim(), 240), due_at: instant(row.due_at), submission_types: row.submission_types?.slice(0, 30),
          submission: row.submission ? { submitted_at: instant(row.submission.submitted_at),
            workflow_state: submissionStates.find(state => state === row.submission?.workflow_state),
            score: finite(row.submission.score), missing: row.submission.missing, excused: row.submission.excused === true } : null,
          points_possible: finite(row.points_possible), assignment_group_id: row.assignment_group_id ?? null,
          omit_from_final_grade: row.omit_from_final_grade === true, grading_type: row.grading_type?.slice(0, 40),
        })),
        assignment_groups: (groups.get(course.id) ?? []).map(group => ({ id: group.id, name: clip(group.name!.trim(), 240), group_weight: finite(group.group_weight) })),
        complete: complete.has(course.id),
        ...(extra && { planner_items: extra.planner.get(course.id) ?? [], coursework_complete: courseworkComplete.has(course.id) }),
      })), ...(extra && { planner_window: extra.plannerWindow, calendar: extra.calendar }) });
    } catch { throw new CanvasRequestError('invalid-response'); }
  }
}
