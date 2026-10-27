import { Injectable } from '@nestjs/common';
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { z } from 'zod';
import { AcademicSnapshot, normalizeCanvasSnapshot } from './canvas-provider';

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

  /** Active courses and their assignments with the current user's submission state, plus assignment groups for grades. */
  async fetchAcademicSnapshot(baseUrl: string, token: string, signal: AbortSignal): Promise<AcademicSnapshot> {
    const origin = canvasOrigin(baseUrl);
    await assertPublicHost(origin, this.deps.lookup);
    const courses = await this.getPages(origin, token, '/api/v1/courses?enrollment_state=active&per_page=100', courseSchema, signal, maxCourses);
    if (courses === 'forbidden') throw new CanvasRequestError('unauthorized');
    const visible = courses.filter(course => course.name?.trim() && !course.access_restricted_by_date && course.workflow_state !== 'deleted');
    const assignments = new Map<number, z.infer<typeof assignmentSchema>[]>();
    const groups = new Map<number, z.infer<typeof groupSchema>[]>();
    // A course counts as complete only when its assignments and groups were all read (ADR 024).
    const complete = new Set<number>();
    for (let start = 0; start < visible.length; start += courseConcurrency) {
      await Promise.all(visible.slice(start, start + courseConcurrency).map(async course => {
        const [rows, sets] = await Promise.all([
          this.getAllPages(origin, token, `/api/v1/courses/${course.id}/assignments?include[]=submission&per_page=100&order_by=due_at`, assignmentSchema, signal, maxAssignmentsPerCourse),
          this.getAllPages(origin, token, `/api/v1/courses/${course.id}/assignment_groups?per_page=100`, groupSchema, signal, 100),
        ]);
        assignments.set(course.id, rows === 'forbidden' ? [] : rows.rows);
        groups.set(course.id, sets === 'forbidden' ? [] : sets.rows.filter(group => group.name?.trim()));
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
        if (kept.length < rows.length) complete.delete(id);
        assignments.set(id, kept);
      }
    }
    const finite = (value: number | null | undefined) => Number.isFinite(value) ? value : null;
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
      })) });
    } catch { throw new CanvasRequestError('invalid-response'); }
  }
}
