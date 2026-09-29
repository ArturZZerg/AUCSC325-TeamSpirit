import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma.service';
import { coverageSchema, EventCoverage, EventProvider, importedEventSchema, inCoverage } from './event-provider';

const sourceSchema = z.object({ source: z.string().regex(/^campus:[a-zA-Z0-9._-]{1,100}$/),
  sourceScope: z.union([z.literal('public'), z.string().refine(value => value.startsWith('user:') && z.string().uuid().safeParse(value.slice(5)).success)]) }).strict();
export type CampusSource = z.infer<typeof sourceSchema>;
/** Internal entry point only. A source key identifies one authoritative feed, never Canvas. */
@Injectable()
export class EventSyncService {
  constructor(private readonly prisma: PrismaService) {}
  async sync(sourceInput: CampusSource, provider: EventProvider, coverageInput: EventCoverage) {
    const source = sourceSchema.parse(sourceInput), coverage = coverageSchema.parse(coverageInput);
    // Lock before fetching: a slow old fetch must not overwrite a newer import.
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${source.source}), hashtext(${source.sourceScope}))::text`;
      let batch;
      try { batch = await provider.fetchEvents(coverage); }
      catch { return { status: 'failed' as const, issues: ['provider-failure'], upserted: 0, removed: 0, retainedSaved: 0 }; }
      const unchanged = (status: 'failed' | 'incomplete', issues: string[]) => ({ status, issues, upserted: 0, removed: 0, retainedSaved: 0 });
      if (batch.status !== 'complete') return unchanged(batch.status, batch.issues);
      if (batch.issues.length || batch.coverage.from !== coverage.from || batch.coverage.through !== coverage.through || batch.coverage.timeZone !== coverage.timeZone || batch.events.length > 2000)
        return unchanged('incomplete', ['invalid-coverage-or-batch']);
      const parsed = z.array(importedEventSchema).safeParse(batch.events);
      if (!parsed.success || new Set(batch.events.map(e => e.externalId)).size !== batch.events.length)
        return unchanged('incomplete', ['invalid-or-duplicate-event']);
      let upserted = 0;
      for (const event of parsed.data) {
        if (!inCoverage(event, coverage) && !await tx.event.findUnique({ where: {
          source_sourceScope_externalId: { ...source, externalId: event.externalId },
        } })) continue;
        upserted++;
        const data = { ...event, timing: event.timing as Prisma.InputJsonValue,
          sortAt: new Date(event.timing.kind === 'timed' ? event.timing.startsAt : `${event.timing.startDate}T00:00:00Z`) };
        await tx.event.upsert({ where: { source_sourceScope_externalId: { ...source, externalId: event.externalId } },
          create: { ...source, ...data }, update: data });
      }
      const ids = new Set(parsed.data.map(e => e.externalId));
      const existing = await tx.event.findMany({ where: source });
      let removed = 0, retainedSaved = 0;
      for (const row of existing) {
        if (ids.has(row.externalId)) continue;
        const normalized = importedEventSchema.parse({ externalId: row.externalId, title: row.title, description: row.description,
          category: row.category, timing: row.timing, location: row.location, url: row.url });
        if (!inCoverage(normalized, coverage)) continue;
        // Lock against concurrent FK inserts (saving) before deciding removal.
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${row.id}::uuid FOR UPDATE`;
        if (await tx.savedEvent.count({ where: { eventId: row.id } })) { retainedSaved++; continue; }
        await tx.event.delete({ where: { id: row.id } }); removed++;
      }
      return { status: 'complete' as const, coverage, issues: [], upserted, removed, retainedSaved };
    }, { timeout: 30000, maxWait: 10000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
