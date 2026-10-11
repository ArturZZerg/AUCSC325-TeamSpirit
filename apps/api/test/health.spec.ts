import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController, HealthService, schemaIsReady } from '../src/health';
import { PrismaService } from '../src/prisma.service';
import { requiredSchema } from '../src/schema-manifest';
import { runtimeConfig } from '../src/runtime-config';

const columns = () => requiredSchema.tables.flatMap(table => table.columns.map(([column_name, udt_name, is_nullable]) =>
  ({ table_name: table.name, column_name, udt_name, is_nullable })));
const migrations = () => requiredSchema.migrations.map(migration => ({ migration_name: migration.name,
  checksum: migration.checksums[0] as string, finished_at: new Date(), rolled_back_at: null as Date | null }));
describe('Dependency readiness contract', () => {
  it('requires every expected column, type, nullability and successful migration', () => {
    expect(schemaIsReady(columns(), migrations())).toBe(true);
    expect(schemaIsReady(columns().slice(1), migrations())).toBe(false);
    expect(schemaIsReady(columns().map((column, i) => i === 0 ? { ...column, udt_name: 'text' } : column), migrations())).toBe(false);
    expect(schemaIsReady(columns().map((column, i) => i === 0 ? { ...column, is_nullable: 'YES' } : column), migrations())).toBe(false);
    expect(schemaIsReady(columns(), migrations().slice(1))).toBe(false);
    expect(schemaIsReady(columns(), migrations().map((migration, i) => i === 0 ? { ...migration, checksum: 'modified' } : migration))).toBe(false);
    expect(schemaIsReady(columns(), migrations().map((migration, i) => i === 0 ? { ...migration, finished_at: null } : migration))).toBe(false);
    expect(schemaIsReady(columns(), migrations().map((migration, i) => i === 0 ? { ...migration, rolled_back_at: new Date() } : migration))).toBe(false);
  });
  it('allows a rolled-back failed attempt followed by the successfully applied migration', () => {
    expect(schemaIsReady(columns(), [...migrations(), { migration_name: 'failed', checksum: '', finished_at: null, rolled_back_at: new Date() }])).toBe(true);
  });
  it('bounds a hung driver, shares the pending check and recovers after it settles', async () => {
    jest.useFakeTimers();
    try {
      let finish!: (value: boolean) => void;
      const prisma = { $transaction: jest.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; })).mockResolvedValue(true) };
      const health = new HealthService(prisma as unknown as PrismaService);
      const first = health.ready(), second = health.ready();
      expect(first).toBe(second);
      await jest.advanceTimersByTimeAsync(3000);
      expect(await first).toBe(false);
      expect(await health.ready()).toBe(false);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      finish(false); await Promise.resolve(); await Promise.resolve();
      expect(await health.ready()).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});

describe('Public health HTTP boundaries', () => {
  let app: INestApplication;
  const query = jest.fn(), prisma = { $transaction: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [HealthController], providers: [HealthService,
      { provide: PrismaService, useValue: prisma }] }).compile();
    app = module.createNestApplication(); app.useLogger(false);
    app.enableCors({ origin: runtimeConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://user@db.example.test/app',
      CORS_ORIGIN: 'https://app.example.test' }).corsOrigins });
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    query.mockResolvedValueOnce(columns()).mockResolvedValueOnce(migrations());
    prisma.$transaction.mockImplementation(async work => work({ $executeRaw: jest.fn(), $queryRaw: query }));
  });
  afterAll(async () => { await app.close(); });
  it('liveness works without authentication or database access', async () => {
    const result = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(result.body).toEqual({ status: 'alive' }); expect(result.headers['cache-control']).toBe('no-store');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('readiness checks schema and returns only a status with no cache', async () => {
    const result = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(result.body).toEqual({ status: 'ready' }); expect(result.headers['cache-control']).toBe('no-store');
  });
  it('allows the declared web origin and ordinary native requests, without reflecting unrelated origins', async () => {
    const allowed = await request(app.getHttpServer()).get('/health/live').set('Origin', 'https://app.example.test').expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.test');
    const unrelated = await request(app.getHttpServer()).get('/health/live').set('Origin', 'https://unrelated.example.test').expect(200);
    expect(unrelated.headers['access-control-allow-origin']).toBeUndefined();
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });
  it('database failure is a generic 503 without raw errors or configuration', async () => {
    prisma.$transaction.mockRejectedValue(new Error('postgres://private:password@host User.passwordHash'));
    const result = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(result.body).toEqual({ message: 'Service unavailable', error: 'Service Unavailable', statusCode: 503 });
    expect(result.headers['cache-control']).toBe('no-store');
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });
});
