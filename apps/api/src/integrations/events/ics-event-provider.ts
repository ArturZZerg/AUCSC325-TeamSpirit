import { isIP } from 'node:net';
import { z } from 'zod';
import ICAL from 'ical.js';
import { Temporal } from '@js-temporal/polyfill';
import { timeZoneSchema } from '@campusflow/contracts';
import { coverageSchema, EventBatch, EventCoverage, EventProvider, ImportedEvent, importedEventSchema, inCoverage } from './event-provider';

type Component = InstanceType<typeof ICAL.Component>;
type Property = InstanceType<typeof ICAL.Property>;
type Stamp = { date: boolean; local: string; zone: string; identity: string };
export type CalendarLoader = (signal: AbortSignal) => Promise<string>;
const MAX_BYTES = 1024 * 1024;
const MAX_STEPS = 20000;
const MAX_EVENTS = 2000;
class IcsIssue extends Error {}
const fail = (message: string): never => { throw new IcsIssue(message); };
const text = (c: Component, name: string): string | null => {
  const value: unknown = c.getFirstPropertyValue(name);
  return value == null ? null : typeof value === 'string' ? value : fail(`invalid-${name}`);
};
const raw = (p: Property): string => {
  const value: unknown = p.toJSON()[3];
  return typeof value === 'string' ? value : fail('invalid-date');
};
function stamp(p: Property | null, fallback?: string, value?: string): Stamp {
  if (!p) return fail('missing-timing');
  const input = value ?? raw(p);
  if (p.type === 'date') {
    const local = Temporal.PlainDate.from(input).toString();
    return { date: true, local, zone: '', identity: `date:${local}` };
  }
  if (p.type !== 'date-time') return fail('unsupported-timing');
  const zone = input.endsWith('Z') ? 'UTC' : p.getParameter('tzid') ?? fallback;
  if (typeof zone !== 'string' || !timeZoneSchema.safeParse(zone).success) return fail('untrusted-timezone');
  const local = Temporal.PlainDateTime.from(input.replace(/Z$/, '')).toString();
  // Reject both nonexistent and ambiguous wall times. No implicit DST guess.
  const instant = Temporal.PlainDateTime.from(local).toZonedDateTime(zone, { disambiguation: 'reject' }).toInstant().toString();
  return { date: false, local, zone, identity: `instant:${instant}` };
}
const instant = (s: Stamp) => Temporal.PlainDateTime.from(s.local).toZonedDateTime(s.zone, { disambiguation: 'reject' }).toInstant().toString();
const shift = (s: Stamp, days: number): Stamp => {
  const local = s.date ? Temporal.PlainDate.from(s.local).add({ days }).toString() : Temporal.PlainDateTime.from(s.local).add({ days }).toString();
  const next = { ...s, local };
  return { ...next, identity: s.date ? `date:${local}` : `instant:${instant(next)}` };
};
// DTEND defines the same exact elapsed duration for every timed recurrence.
function occurrenceEnd(start: Stamp, end: Stamp | undefined, occurrence: Stamp): Stamp | undefined {
  if (!end) return undefined;
  if (start.date !== end.date) return fail('inconsistent-end');
  if (start.date) {
    const days = Temporal.PlainDate.from(start.local).until(Temporal.PlainDate.from(end.local), { largestUnit: 'days' }).days;
    return shift(occurrence, days);
  }
  const duration = Temporal.Instant.from(instant(end)).epochNanoseconds - Temporal.Instant.from(instant(start)).epochNanoseconds;
  const finish = Temporal.Instant.fromEpochNanoseconds(Temporal.Instant.from(instant(occurrence)).epochNanoseconds + duration);
  return { ...occurrence, local: finish.toZonedDateTimeISO(occurrence.zone).toPlainDateTime().toString() };
}
const identity = (uid: string, occurrence?: Stamp) => JSON.stringify(occurrence ? [uid, occurrence.identity] : [uid]);
function normalize(c: Component, uid: string, start: Stamp, end: Stamp | undefined, occurrence?: Stamp): ImportedEvent {
  if (end && (start.date !== end.date)) fail('inconsistent-end');
  const timing = start.date ? { kind: 'allDay' as const, startDate: start.local,
    endDateExclusive: end?.local ?? Temporal.PlainDate.from(start.local).add({ days: 1 }).toString() }
    : { kind: 'timed' as const, startsAt: instant(start), endsAt: end ? instant(end) : null };
  const url = text(c, 'url');
  if (url && !/^https?:\/\//i.test(url)) fail('unsafe-event-url');
  return importedEventSchema.parse({ externalId: identity(uid, occurrence), title: text(c, 'summary'), description: text(c, 'description'),
    category: text(c, 'categories'), timing, location: text(c, 'location'), url });
}

/** Supported RRULE subset is deliberately explicit. Unsupported semantics invalidate the batch. */
function rule(c: Component) {
  const property = c.getFirstProperty('rrule');
  if (!property) return undefined;
  const r = z.object({
    freq: z.enum(['DAILY', 'WEEKLY']), interval: z.number().int().min(1).max(366).optional(),
    count: z.number().int().positive().optional(), until: z.string().optional(),
    byday: z.union([z.string(), z.array(z.string())]).optional(), wkst: z.literal(2).optional(),
  }).strict().parse(property.toJSON()[3]);
  if (r.count && r.until) fail('unsupported-recurrence');
  const days = (typeof r.byday === 'string' ? [r.byday] : r.byday)?.map(d => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].indexOf(d) + 1);
  if (days && (r.freq !== 'WEEKLY' || days.some(d => !d))) fail('unsupported-recurrence');
  if (r.until) {
    if (r.until.length === 10) Temporal.PlainDate.from(r.until);
    else if (r.until.endsWith('Z')) Temporal.Instant.from(r.until);
    else fail('invalid-until');
  }
  return { frequency: r.freq, interval: r.interval ?? 1, count: r.count ?? Infinity, days, until: r.until };

}

export class IcsEventProvider implements EventProvider {
  constructor(private readonly load: CalendarLoader, private readonly options: { timeZone?: string; timeoutMs?: number } = {}) {
    if (options.timeZone) timeZoneSchema.parse(options.timeZone);
    if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30000)) throw new Error('Invalid timeout');
  }
  async fetchEvents(input: EventCoverage): Promise<EventBatch> {
    const coverage = coverageSchema.parse(input);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let payload: string;
    try {
      payload = await Promise.race([this.load(controller.signal), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('source-timeout')); }, this.options.timeoutMs ?? 5000);
      })]);
    } catch { return { status: 'failed', issues: [controller.signal.aborted ? 'source-timeout' : 'source-failure'] }; }
    finally { if (timer) clearTimeout(timer); }
    if (typeof payload !== 'string' || Buffer.byteLength(payload) > MAX_BYTES) return { status: 'failed', issues: ['payload-limit'] };
    const events: ImportedEvent[] = [], issues: string[] = [];
    try {
      // Strict envelope and shallow component bounds before handing input to the parser.
      const lines = payload.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').trim().split('\n');
      const stack: string[] = [];
      for (const line of lines) {
        if (line.startsWith('BEGIN:')) { stack.push(line.slice(6)); if (stack.length > 4) fail('component-depth'); }
        if (line.startsWith('END:') && stack.pop() !== line.slice(4)) fail('unbalanced-calendar');
      }
      if (stack.length || lines[0] !== 'BEGIN:VCALENDAR' || lines.at(-1) !== 'END:VCALENDAR' || lines.filter(l => l === 'BEGIN:VCALENDAR').length !== 1) fail('invalid-calendar');
      // ICAL.parse coerces some malformed numeric rule values (e.g. INTERVAL=0).
      // Validate their original spelling before the syntax library can normalize it.
      for (const line of lines.filter(value => /^RRULE(?:;[^:]*)?:/i.test(value))) {
        const entries = line.slice(line.indexOf(':') + 1).split(';').map(part => part.split('='));
        if (entries.some(entry => entry.length !== 2) || new Set(entries.map(([key]) => key.toUpperCase())).size !== entries.length
          || entries.some(([key, value]) => /^(INTERVAL|COUNT)$/i.test(key)
            && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)))
          return { status: 'incomplete', coverage, events: [], issues: ['invalid-recurrence'] };
      }
      const calendar = new ICAL.Component(ICAL.parse(payload));
      if (calendar.name !== 'vcalendar' || text(calendar, 'version') !== '2.0' || (text(calendar, 'method') && text(calendar, 'method') !== 'PUBLISH')) fail('unsupported-calendar');
      const components = calendar.getAllSubcomponents('vevent');
      if (components.length > MAX_EVENTS || calendar.getAllSubcomponents().some(c => !['vevent', 'vtimezone'].includes(c.name))) fail('component-limit-or-type');
      const groups = new Map<string, Component[]>();
      for (const c of components) {
        const uid = text(c, 'uid');
        if (!uid || uid.length > 1000) { issues.push('missing-or-invalid-uid'); continue; }
        groups.set(uid, [...(groups.get(uid) ?? []), c]);
      }
      let steps = 0;
      for (const [uid, group] of groups) {
        try {
          for (const c of group) {
            for (const key of ['uid', 'dtstart', 'dtend', 'summary', 'rrule', 'recurrence-id', 'status'])
              if (c.getAllProperties(key).length > 1) fail('duplicate-property');
            if (c.hasProperty('duration') || c.hasProperty('exrule') || c.getFirstProperty('recurrence-id')?.getParameter('range')) fail('unsupported-event-semantics');
          }
          const masters = group.filter(c => !c.hasProperty('recurrence-id'));
          if (masters.length !== 1) fail('missing-or-duplicate-master');
          const master = masters[0];
          if (text(master, 'status') === 'CANCELLED') continue;
          const start = stamp(master.getFirstProperty('dtstart'), this.options.timeZone);
          const end = master.hasProperty('dtend') ? stamp(master.getFirstProperty('dtend'), this.options.timeZone) : undefined;
          normalize(master, uid, start, end);
          const recurrence = rule(master);
          const recurring = !!recurrence || master.hasProperty('rdate');
          if (!recurring && group.length > 1) fail('exception-without-recurrence');
          const overrides = new Map<string, { c: Component; original: Stamp }>();
          for (const c of group.filter(c => c !== master)) {
            const original = stamp(c.getFirstProperty('recurrence-id'), this.options.timeZone);
            if (original.date !== start.date || overrides.has(original.identity)) fail('invalid-exception');
            overrides.set(original.identity, { c, original });
          }
          const exclusions = new Set<string>();
          const dates = (name: string) => master.getAllProperties(name).flatMap(p => (p.toJSON().slice(3) as unknown[]).map(v => {
            if (typeof v !== 'string') return fail('unsupported-recurrence-date');
            return stamp(p, this.options.timeZone, v);
          }));
          for (const ex of dates('exdate')) exclusions.add(ex.identity);
          const occurrences = new Map<string, { start: Stamp; end?: Stamp }>();
          const add = (s: Stamp, e?: Stamp) => { occurrences.set(s.identity, { start: s, end: e }); };
          add(start, end);
          if (recurrence) {
            let count = 0;
            const anchor = Temporal.PlainDate.from(start.local.slice(0, 10));
            const until = recurrence.until;
            for (let offset = 0; ; offset++) {
              if (++steps > MAX_STEPS) fail('expansion-limit');
              const date = anchor.add({ days: offset });
              // One extra local day covers zones west/east of the coverage zone.
              if (Temporal.PlainDate.compare(date, Temporal.PlainDate.from(coverage.through).add({ days: 1 })) > 0) break;
              const matches = recurrence.frequency === 'DAILY' ? offset % recurrence.interval === 0
                : Math.floor((offset + anchor.dayOfWeek - 1) / 7) % recurrence.interval === 0 && (recurrence.days ?? [anchor.dayOfWeek]).includes(date.dayOfWeek);
              if (!matches) continue;
              const s = shift(start, offset);
              if (until) {
                const untilValue = until;
                if (start.date !== (until.length === 10) || (!start.date && !untilValue.endsWith('Z'))) fail('invalid-until');
                if (start.date ? s.local > untilValue : Temporal.Instant.compare(instant(s), untilValue) > 0) break;
              }
              if (++count > recurrence.count) break;
              add(s, occurrenceEnd(start, end, s));
            }
          }
          for (const s of dates('rdate')) {
            if (s.date !== start.date || s.zone !== start.zone) fail('inconsistent-rdate');
            add(s, occurrenceEnd(start, end, s));
          }
          for (const [key, occurrence] of occurrences) {
            if (exclusions.has(key) || overrides.has(key)) continue;
            const event = normalize(master, uid, occurrence.start, occurrence.end, recurring ? occurrence.start : undefined);
            if (!recurring || inCoverage(event, coverage)) events.push(event);
          }
          // Detached moved instances may now overlap coverage even if their original date did not.
          for (const { c, original } of overrides.values()) {
            if (text(c, 'status') === 'CANCELLED') continue;
            const event = normalize(c, uid, stamp(c.getFirstProperty('dtstart'), this.options.timeZone),
              c.hasProperty('dtend') ? stamp(c.getFirstProperty('dtend'), this.options.timeZone) : undefined, original);
            events.push(event);
          }
          if (events.length > MAX_EVENTS) fail('event-limit');
        } catch (error) { issues.push(error instanceof IcsIssue ? error.message : 'invalid-event'); }
      }
      if (events.length > MAX_EVENTS || new Set(events.map(e => e.externalId)).size !== events.length) issues.push('event-limit-or-duplicate');
      return { status: issues.length ? 'incomplete' : 'complete', coverage, events: issues.length ? [] : events, issues };
    } catch { return { status: 'failed', issues: ['malformed-or-unsupported-calendar'] }; }
  }
}

/** Trusted operator configuration only; never expose this constructor through a public URL parameter. */
export function httpsCalendarLoader(configuredUrl: string): CalendarLoader {
  const url = new URL(configuredUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') || isIP(url.hostname.replace(/^\[|\]$/g, '')) || /\.(local|localhost|internal)\.?$/i.test(url.hostname)) throw new Error('Expected an approved public HTTPS calendar URL');
  return async signal => {
    const response = await fetch(url, { signal, redirect: 'error', headers: { Accept: 'text/calendar' } });
    if (!response.ok || !/^text\/calendar(?:;|$)/i.test(response.headers.get('content-type') ?? '') || Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) {
      await response.body?.cancel(); throw new Error('Invalid calendar response');
    }
    if (!response.body) throw new Error('Missing calendar body');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error('Calendar payload too large');
        chunks.push(value);
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } finally { await reader.cancel(); reader.releaseLock(); }
  };
}
