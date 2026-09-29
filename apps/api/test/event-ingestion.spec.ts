import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { EventSyncService } from '../src/integrations/events/event-sync.service';
import { IcsEventProvider } from '../src/integrations/events/ics-event-provider';
import { EventProvider } from '../src/integrations/events/event-provider';
import { coverage, calendar, vevent } from './fixtures/campus-calendar';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('campus event ingestion and API with PostgreSQL', () => {
  let app: INestApplication, db: PrismaService, sync: EventSyncService;
  let token: string, otherToken: string, userId: string, otherId: string;
  const marker = `campus:test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const source = { source: marker, sourceScope: 'public' };
  const provider = (body: string) => new IcsEventProvider(async () => body);
  const body = (title = 'Original', time = '160000', extra = '') => calendar(vevent(`DTSTART:20260308T${time}Z\r\nDTEND:20260308T190000Z\r\nLOCATION:Library\r\n${extra}`).replace('SUMMARY:Lecture', `SUMMARY:${title}`));
  const client = () => request(app.getHttpServer());
  const list = (query = '', auth = token) => client().get(`/events${query}`).set('Authorization', auth);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    db = app.get(PrismaService); sync = app.get(EventSyncService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker.replace(':', '-')}-${label}@example.test`, displayName: label,
        password: 'test-campus-password-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { token = `Bearer ${response.body.accessToken}`; userId = response.body.user.id; }
      else { otherToken = `Bearer ${response.body.accessToken}`; otherId = response.body.user.id; }
    }
  });
  beforeEach(async () => { await db.event.deleteMany({ where: { source: marker } }); });
  afterAll(async () => {
    if (db) { await db.event.deleteMany({ where: { source: marker } }); await db.user.deleteMany({ where: { id: { in: [userId, otherId].filter(Boolean) } } }); }
    if (app) await app.close();
  });
  it('imports idempotently, updates all metadata/timing in place and preserves SavedEvent', async () => {
    expect(await sync.sync(source, provider(body()), coverage)).toMatchObject({ status: 'complete', upserted: 1 });
    const first = await db.event.findFirstOrThrow({ where: source });
    await client().put(`/events/${first.id}/saved`).set('Authorization', token).send({ includedInPlan: true }).expect(200);
    await Promise.all([sync.sync(source, provider(body()), coverage), sync.sync(source, provider(body()), coverage)]);
    expect(await db.event.count({ where: source })).toBe(1);
    const changed = body('Changed', '170000', 'DESCRIPTION:Updated\r\nURL:https://example.org/updated\r\nCATEGORIES:lecture').replace('LOCATION:Library', 'LOCATION:Hall');
    await sync.sync(source, provider(changed), coverage);
    const updated = await db.event.findFirstOrThrow({ where: source });
    expect(updated).toMatchObject({ id: first.id, title: 'Changed', location: 'Hall', description: 'Updated', category: 'lecture', url: 'https://example.org/updated', timing: { startsAt: '2026-03-08T17:00:00Z' } });
    expect(await db.savedEvent.count({ where: { eventId: first.id, userId, includedInPlan: true } })).toBe(1);
    const snapshot = await client().get('/snapshot?date=2026-03-08').set('Authorization', token).expect(200);
    expect(snapshot.body.events).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.id, title: 'Changed' })]));
    expect(snapshot.body.savedEvents).toEqual(expect.arrayContaining([expect.objectContaining({ eventId: first.id, includedInPlan: true })]));
    const today = await client().get('/today?date=2026-03-08').set('Authorization', token).expect(200);
    expect(today.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: first.id, kind: 'event' })]));
    expect(today.body.campusEvents.some((e: { id: string }) => e.id === first.id)).toBe(false);
  });
  it('serializes fetching and commit for concurrent imports of the same source', async () => {
    let entered!: () => void, release!: () => void;
    const firstEntered = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = sync.sync(source, new IcsEventProvider(async () => { entered(); await gate; return body('Old'); }), coverage);
    await firstEntered;
    const second = sync.sync(source, provider(body('New')), coverage);
    release();
    await Promise.all([first, second]);
    expect(await db.event.findMany({ where: source })).toEqual([expect.objectContaining({ title: 'New' })]);
  });
  it('updates an existing identity moved outside coverage without deleting its saved state', async () => {
    await sync.sync(source, provider(body()), coverage);
    const original = await db.event.findFirstOrThrow({ where: source });
    await db.savedEvent.create({ data: { eventId: original.id, userId } });
    await sync.sync(source, provider(body('Moved').replaceAll('20260308', '20260508')), coverage);
    expect(await db.event.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ title: 'Moved', timing: { startsAt: '2026-05-08T16:00:00Z' } });
    expect(await db.savedEvent.count({ where: { eventId: original.id } })).toBe(1);
  });
  it('updates a moved recurrence instance under its original identity', async () => {
    const master = vevent('DTSTART:20260308T160000Z\r\nRRULE:FREQ=DAILY;COUNT=3');
    await sync.sync(source, provider(calendar(master)), coverage);
    const rows = await db.event.findMany({ where: source }); expect(rows).toHaveLength(3);
    const movedId = rows.find(r => r.externalId.includes('2026-03-09'))!.id;
    await sync.sync(source, provider(calendar(master, vevent('RECURRENCE-ID:20260309T160000Z\r\nDTSTART:20260309T180000Z'))), coverage);
    expect(await db.event.count({ where: source })).toBe(3);
    expect(await db.event.findUniqueOrThrow({ where: { id: movedId } })).toMatchObject({ timing: { startsAt: '2026-03-09T18:00:00Z' } });
    await sync.sync(source, provider(calendar(master, vevent('RECURRENCE-ID:20260309T160000Z\r\nSTATUS:CANCELLED'))), coverage);
    expect(await db.event.findUnique({ where: { id: movedId } })).toBeNull();
  });
  it.each(['failed', 'incomplete', 'throws', 'malformed'] as const)('preserves prior events after %s import', async mode => {
    await sync.sync(source, provider(body()), coverage);
    const first = await db.event.findFirstOrThrow({ where: source });
    const bad: EventProvider = mode === 'malformed' ? provider(calendar(vevent('DTSTART:20260230T120000Z'))) : {
      fetchEvents: async () => { if (mode === 'throws') throw new Error('network');
        return mode === 'failed' ? { status: 'failed', issues: ['timeout'] } : { status: 'incomplete', events: [], coverage, issues: ['partial'] }; },
    };
    expect((await sync.sync(source, bad, coverage)).status).not.toBe('complete');
    expect(await db.event.findMany({ where: source })).toEqual([first]);
  });
  it('reconciles a complete empty window, preserving saved and out-of-window events', async () => {
    await sync.sync(source, provider(calendar(vevent('DTSTART:20260308T160000Z', 'saved'), vevent('DTSTART:20260309T160000Z', 'gone'))), coverage);
    const saved = await db.event.findFirstOrThrow({ where: { ...source, externalId: '["saved"]' } });
    await db.savedEvent.create({ data: { eventId: saved.id, userId } });
    const outside = await db.event.create({ data: { ...source, externalId: 'outside', title: 'Outside', timing: { kind: 'timed', startsAt: '2026-05-01T12:00:00Z', endsAt: null }, sortAt: new Date('2026-05-01') } });
    expect(await sync.sync(source, provider(calendar()), coverage)).toMatchObject({ status: 'complete', removed: 1, retainedSaved: 1 });
    expect((await db.event.findMany({ where: source })).map(e => e.id).sort()).toEqual([saved.id, outside.id].sort());
    expect(await db.savedEvent.count({ where: { eventId: saved.id } })).toBe(1);
  });
  it('rejects mismatched complete coverage and duplicate normalized identities without writes', async () => {
    await sync.sync(source, provider(body()), coverage);
    const parsed = await provider(body()).fetchEvents(coverage);
    if (parsed.status === 'failed') throw new Error('fixture');
    for (const batch of [{ ...parsed, coverage: { ...coverage, through: '2026-03-10' } }, { ...parsed, events: [...parsed.events, ...parsed.events] }]) {
      expect(await sync.sync(source, { fetchEvents: async () => batch }, coverage)).toMatchObject({ status: 'incomplete' });
    }
    expect(await db.event.count({ where: source })).toBe(1);
  });
  it('rolls back the batch when persistence fails midway', async () => {
    await sync.sync(source, provider(body()), coverage);
    const before = await db.event.findMany({ where: source });
    // A vanished private owner is not involved: force a DB constraint failure in a transaction after a write.
    const original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => original(async tx => {
      await work(tx); throw new Error('simulated persistence failure');
    })) as unknown as typeof db.$transaction);
    try { await expect(sync.sync(source, provider(body('Changed')), coverage)).rejects.toThrow('simulated persistence failure'); }
    finally { spy.mockRestore(); }
    expect(await db.event.findMany({ where: source })).toEqual(before);
  });
  it('keeps public/private source imports isolated in Events, Today and snapshot', async () => {
    await sync.sync(source, provider(body('Public')), coverage);
    await sync.sync({ ...source, sourceScope: `user:${userId}` }, provider(body('Mine')), coverage);
    await sync.sync({ ...source, sourceScope: `user:${otherId}` }, provider(body('Other')), coverage);
    for (const [auth, names] of [[token, ['Public', 'Mine']], [otherToken, ['Public', 'Other']]] as const) {
      const response = await list('', auth).expect(200);
      expect(response.body.filter((e: { source: string }) => e.source === marker).map((e: { title: string }) => e.title).sort()).toEqual([...names].sort());
      for (const path of ['/today?date=2026-03-08', '/snapshot?date=2026-03-08']) {
        const result = await client().get(path).set('Authorization', auth).expect(200);
        const events = result.body.campusEvents ?? result.body.events;
        expect(events.filter((e: { source: string }) => e.source === marker).map((e: { title: string }) => e.title).sort()).toEqual([...names].sort());
      }
    }
    const privateEvent = await db.event.findFirstOrThrow({ where: { ...source, sourceScope: `user:${otherId}` } });
    await client().put(`/events/${privateEvent.id}/saved`).set('Authorization', token).send({}).expect(404);
  });
  it.each(['from=2026-02-30', 'from=2026-02-30T12%3A00%3A00Z', 'from=bad', 'from=2026-03-10&through=2026-03-08', 'from=2026-03-08&through=2026-03-08', 'from=2026-03-08&from=2026-03-09', 'unknown=true', 'category=x&category=y'])('rejects invalid query %s', async query => {
    await list(`?${query}`).expect(400);
  });
  it('uses actual overlap and local DST boundaries rather than sortAt, preserving saved/category state', async () => {
    const fixtures = [
      ['before', { kind: 'timed', startsAt: '2026-03-07T23:00:00Z', endsAt: '2026-03-08T08:00:00Z' }],
      ['spans', { kind: 'timed', startsAt: '2026-03-01T00:00:00Z', endsAt: '2026-03-20T00:00:00Z' }],
      ['ends-at-start', { kind: 'timed', startsAt: '2026-03-07T23:00:00Z', endsAt: '2026-03-08T07:00:00Z' }],
      ['starts-at-end', { kind: 'timed', startsAt: '2026-03-09T06:00:00Z', endsAt: null }],
      ['multi', { kind: 'allDay', startDate: '2026-03-07', endDateExclusive: '2026-03-10' }],
      ['all-day-ended', { kind: 'allDay', startDate: '2026-03-07', endDateExclusive: '2026-03-08' }],
      ['point', { kind: 'timed', startsAt: '2026-03-08T07:00:00Z', endsAt: null }],
    ] as const;
    for (const [externalId, timing] of fixtures) await db.event.create({ data: { ...source, externalId, title: externalId,
      category: 'campus', timing: timing as Prisma.InputJsonValue, sortAt: new Date('2026-03-08T12:00:00Z') } });
    const saved = await db.event.findFirstOrThrow({ where: { ...source, externalId: 'before' } });
    await db.savedEvent.create({ data: { eventId: saved.id, userId, includedInPlan: true } });
    const response = await list('?from=2026-03-08&through=2026-03-09&category=campus').expect(200);
    expect(response.body.map((e: { title: string }) => e.title)).toEqual(['spans', 'multi', 'before', 'point']);
    expect(response.body.find((e: { id: string }) => e.id === saved.id)).toMatchObject({ saved: true, includedInPlan: true });
    expect((await list('?category=other').expect(200)).body).toEqual([]);
    const equivalent = await list('?from=2026-03-08T07%3A00%3A00Z&through=2026-03-09T06%3A00%3A00Z&category=campus').expect(200);
    expect(equivalent.body).toEqual(response.body);
  });
});
