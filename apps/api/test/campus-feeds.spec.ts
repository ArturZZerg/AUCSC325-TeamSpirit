import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { CAMPUS_FEEDS, configuredCampusFeeds } from '../src/integrations/events/campus-feeds';
import { CampusFeedsService } from '../src/integrations/events/campus-feeds.service';
import { EventSyncService } from '../src/integrations/events/event-sync.service';
import { IcsEventProvider } from '../src/integrations/events/ics-event-provider';
import { calendar, vevent } from './fixtures/campus-calendar';

describe('reviewed campus source configuration', () => {
  it('disables network by default and rejects unknown modes and user URLs', () => {
    expect(configuredCampusFeeds('disabled')).toEqual([]);
    expect(() => configuredCampusFeeds('https://example.org/feed')).toThrow();
    expect(configuredCampusFeeds('augustana').map(feed => feed.source)).toEqual(['campus:augustana-recreation', 'campus:augustana-breakout']);
  });
});
const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('live campus refresh lifecycle with PostgreSQL', () => {
  let app: INestApplication, db: PrismaService, sync: EventSyncService, feeds: CampusFeedsService;
  let token: string, userId: string; let payload: string;
  const source = { source: `campus:live-test-${Date.now()}`, sourceScope: 'public' };
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const coverage = { from: date, through: new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10), timeZone: 'UTC' };
  const refresh = { now, successIntervalMs: 3600000, failureIntervalMs: 900000 };
  const body = (title = 'Climbing') => calendar(vevent(`DTSTART:${date.replaceAll('-', '')}T190000Z`).replace('SUMMARY:Lecture', `SUMMARY:${title}`));
  const provider = new IcsEventProvider(async () => payload);
  beforeAll(async () => {
    const noBackground = jest.spyOn(CampusFeedsService.prototype, 'onApplicationBootstrap').mockImplementation(() => undefined);
    try {
      const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CAMPUS_FEEDS).useValue([
        { ...source, name: 'Test campus', timeZone: 'UTC', website: 'https://example.org/campus', provider },
      ]).compile();
      app = module.createNestApplication(); app.useLogger(false); await app.init();
    } finally { noBackground.mockRestore(); }
    db = app.get(PrismaService); sync = app.get(EventSyncService); feeds = app.get(CampusFeedsService);
    const response = await request(app.getHttpServer()).post('/auth/register').send({ email: `${source.source.replace(':', '-')}@example.test`, displayName: 'Student', password: 'campus-feed-password-123', timeZone: 'UTC' }).expect(201);
    token = `Bearer ${response.body.accessToken}`; userId = response.body.user.id;
  });
  beforeEach(async () => { payload = body(); await db.event.deleteMany({ where: source }); await db.campusFeedState.deleteMany({ where: { source: source.source } }); });
  afterAll(async () => {
    if (db) { await db.event.deleteMany({ where: source }); await db.campusFeedState.deleteMany({ where: { source: source.source } }); await db.user.deleteMany({ where: { id: userId } }); }
    if (app) await app.close();
  });
  it('imports real provider results, exposes successful coverage and preserves identity on repeats', async () => {
    await feeds.refresh(now);
    const first = await db.event.findFirstOrThrow({ where: source });
    await request(app.getHttpServer()).put(`/events/${first.id}/saved`).set('Authorization', token).send({ includedInPlan: true }).expect(200);
    await feeds.refresh(new Date(now.getTime() + 3600001));
    expect(await db.event.findMany({ where: source })).toEqual([first]);
    expect(await db.savedEvent.count({ where: { userId, eventId: first.id, includedInPlan: true } })).toBe(1);
    expect(await feeds.status(new Date(now.getTime() + 3600002))).toMatchObject({ sources: [{ source: source.source, availability: 'available', coverage: { timeZone: 'UTC' } }] });
  });
  it('serializes and throttles two replicas before fetching, including after restart', async () => {
    const fetch = jest.spyOn(provider, 'fetchEvents');
    try {
      const results = await Promise.all([sync.sync(source, provider, coverage, refresh), sync.sync(source, provider, coverage, refresh)]);
      expect(results.map(result => result.status).sort()).toEqual(['complete', 'skipped']); expect(fetch).toHaveBeenCalledTimes(1);
      expect((await sync.sync(source, provider, coverage, refresh)).status).toBe('skipped');
    } finally { fetch.mockRestore(); }
  });
  it.each(['invalid', 'empty'] as const)('records %s refresh honestly and preserves saved state', async kind => {
    await sync.sync(source, provider, coverage, refresh); const first = await db.event.findFirstOrThrow({ where: source });
    await db.savedEvent.create({ data: { userId, eventId: first.id } });
    payload = kind === 'invalid' ? calendar(vevent('DTSTART:invalid')) : calendar();
    const later = new Date(now.getTime() + 3600001);
    const result = await sync.sync(source, provider, coverage, { ...refresh, now: later });
    expect(result.status).toBe(kind === 'invalid' ? 'incomplete' : 'complete');
    expect(await db.event.findUnique({ where: { id: first.id } })).not.toBeNull();
    const status = await feeds.status(later);
    expect(status.sources[0].availability).toBe(kind === 'invalid' ? 'stale' : 'available');
    expect(status.sources[0].lastSuccessfulAt).toBe((kind === 'invalid' ? now : later).toISOString());
  });
  it('ages fresh status to stale and exposes no successful coverage before the first import', async () => {
    expect(await feeds.status(now)).toMatchObject({ sources: [{ availability: 'unavailable', coverage: null, lastSuccessfulAt: null }] });
    await sync.sync(source, provider, coverage, refresh);
    expect(await feeds.status(new Date(now.getTime() + 90 * 60000))).toMatchObject({ sources: [{ availability: 'stale' }] });
  });
  it('retries first-import failures after fifteen minutes without treating them as empty success', async () => {
    payload = '<html>source unavailable</html>';
    expect((await sync.sync(source, provider, coverage, refresh)).status).toBe('failed');
    expect(await feeds.status(now)).toMatchObject({ sources: [{ availability: 'unavailable', lastSuccessfulAt: null, coverage: null }] });
    payload = body();
    expect((await sync.sync(source, provider, coverage, { ...refresh, now: new Date(now.getTime() + 899999) })).status).toBe('skipped');
    expect(await db.event.count({ where: source })).toBe(0);
    expect((await sync.sync(source, provider, coverage, { ...refresh, now: new Date(now.getTime() + 900000) })).status).toBe('complete');
    expect(await db.event.count({ where: source })).toBe(1);
  });
  it('rolls back feed freshness along with event writes if persistence fails', async () => {
    await sync.sync(source, provider, coverage, refresh); const state = await db.campusFeedState.findUniqueOrThrow({ where: { source: source.source } });
    const original = db.$transaction.bind(db); payload = body('Changed');
    const spy = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => original(async tx => { await work(tx); throw new Error('rollback'); })) as unknown as typeof db.$transaction);
    try { await expect(sync.sync(source, provider, coverage, { ...refresh, now: new Date(now.getTime() + 3600001) })).rejects.toThrow('rollback'); }
    finally { spy.mockRestore(); }
    expect(await db.campusFeedState.findUniqueOrThrow({ where: { source: source.source } })).toEqual(state);
    expect(await db.event.findFirstOrThrow({ where: source })).toMatchObject({ title: 'Climbing' });
  });
  it('requires authentication and only exposes reviewed public source metadata', async () => {
    await request(app.getHttpServer()).get('/events/sources').expect(401);
    const response = await request(app.getHttpServer()).get('/events/sources').set('Authorization', token).expect(200);
    expect(response.body.sources).toEqual([{ source: source.source, name: 'Test campus', website: 'https://example.org/campus', availability: 'unavailable', lastSuccessfulAt: null, coverage: null }]);
    expect(JSON.stringify(response.body)).not.toContain('calendar/ical');
  });
});
