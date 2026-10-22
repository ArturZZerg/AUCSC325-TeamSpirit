import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { canvasSource, fixtureBaseUrl } from '../src/canvas';
import { CanvasHttpClient } from '../src/integrations/canvas/canvas-http';
import { CanvasSyncWorker, canvasSyncPolicy } from '../src/integrations/canvas/canvas-sync-worker';
import { sealCanvasToken } from '../src/integrations/canvas/canvas-token';
import { PrismaService } from '../src/prisma.service';

const origin = 'https://school.instructure.com';
const token = 'canvas-personal-token-0123456789abcdef';
const routes: Record<string, unknown> = {
  [`${origin}/api/v1/courses?enrollment_state=active&per_page=100`]: [{ id: 1, name: 'AUCSC 325' }],
  [`${origin}/api/v1/courses/1/assignments?include[]=submission&per_page=100&order_by=due_at`]: [{ id: 11, name: 'Essay', due_at: '2026-10-24T05:59:00Z' }],
};
const fakeFetch = (async (input: string | URL | Request) => {
  const body = routes[String(input)];
  return new Response(JSON.stringify(body ?? []), { status: body ? 200 : 404 });
}) as typeof fetch;

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('Canvas background sync with PostgreSQL (ADR 019)', () => {
  let app: INestApplication, db: PrismaService, worker: CanvasSyncWorker;
  const ids: Record<'never' | 'stale' | 'fresh' | 'failedRecent' | 'failedOld' | 'fixture', string> = {} as never;
  const marker = `canvas-worker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const env = { NODE_ENV: process.env.NODE_ENV, CANVAS_MODE: process.env.CANVAS_MODE, CANVAS_TOKEN_KEY: process.env.CANVAS_TOKEN_KEY };
  const key = randomBytes(32);
  const now = new Date('2026-10-21T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; process.env.CANVAS_MODE = 'token'; process.env.CANVAS_TOKEN_KEY = key.toString('base64');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    db = app.get(PrismaService); worker = app.get(CanvasSyncWorker);
    app.get(CanvasHttpClient).deps = { fetch: fakeFetch, lookup: async () => [{ address: '93.184.216.34', family: 4 }] };
    for (const label of Object.keys({ never: 0, stale: 0, fresh: 0, failedRecent: 0, failedOld: 0, fixture: 0 }) as (keyof typeof ids)[]) {
      const response = await request(app.getHttpServer()).post('/auth/register').send({ email: `${marker}-${label.toLowerCase()}@example.test`,
        displayName: label, password: 'canvas-worker-password-123', timeZone: 'America/Edmonton' }).expect(201);
      ids[label] = response.body.user.id;
    }
    const live = (userId: string, lastSyncAttemptAt: Date | null, lastError: string | null = null) => db.canvasConnection.create({ data: {
      userId, baseUrl: origin, externalAccountId: '77', encryptedAccessToken: sealCanvasToken(key, userId, token), lastSyncAttemptAt, lastError } });
    await live(ids.never, null);
    await live(ids.stale, ago(canvasSyncPolicy.freshMs + 60_000));
    await live(ids.fresh, ago(60_000));
    await live(ids.failedRecent, ago(canvasSyncPolicy.freshMs + 60_000), 'Canvas couldn’t be reached. Try again in a moment.');
    await live(ids.failedOld, ago(canvasSyncPolicy.failedRetryMs + 60_000), 'Canvas couldn’t be reached. Try again in a moment.');
    await db.canvasConnection.create({ data: { userId: ids.fixture, baseUrl: fixtureBaseUrl, externalAccountId: `fixture-${ids.fixture}`, encryptedAccessToken: 'fixture' } });
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } });
    if (app) await app.close();
    for (const [name, value] of Object.entries(env)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });

  it('syncs only due token connections, backs off after failures and repeats idempotently', async () => {
    // Other suites may share the database; only this suite's accounts are asserted.
    await worker.runOnce(now);
    const synced = async (userId: string) => (await db.canvasConnection.findUniqueOrThrow({ where: { userId } })).lastSuccessfulSyncAt !== null;
    expect(await synced(ids.never)).toBe(true);
    expect(await synced(ids.stale)).toBe(true);
    expect(await synced(ids.failedOld)).toBe(true);
    expect(await synced(ids.fresh)).toBe(false);
    expect(await synced(ids.failedRecent)).toBe(false);
    expect(await synced(ids.fixture)).toBe(false);
    expect(await db.academicItem.count({ where: { userId: ids.never, source: canvasSource } })).toBe(1);
    expect((await db.canvasConnection.findUniqueOrThrow({ where: { userId: ids.failedOld } })).lastError).toBeNull();

    // Just-synced accounts are fresh now: a second pass leaves them alone and creates no duplicates.
    const before = await db.canvasConnection.findUniqueOrThrow({ where: { userId: ids.never } });
    await worker.runOnce(new Date());
    expect((await db.canvasConnection.findUniqueOrThrow({ where: { userId: ids.never } })).lastSuccessfulSyncAt).toEqual(before.lastSuccessfulSyncAt);
    expect(await db.academicItem.count({ where: { userId: ids.never, source: canvasSource } })).toBe(1);
  });

  it('does nothing outside token mode', async () => {
    process.env.CANVAS_MODE = 'fixture';
    try { expect(await worker.runOnce(new Date('2030-01-01T00:00:00.000Z'))).toBe(0); }
    finally { process.env.CANVAS_MODE = 'token'; }
  });
});
