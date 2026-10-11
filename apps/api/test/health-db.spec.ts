import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { HealthService } from '../src/health';
import { PrismaService } from '../src/prisma.service';
import { requiredSchema } from '../src/schema-manifest';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('Readiness against disposable PostgreSQL schema', () => {
  const schema = `health_${randomUUID().replace(/-/g, '')}`;
  const originalUrl = process.env.DATABASE_URL!;
  const sourceSchema = new URL(originalUrl).searchParams.get('schema') ?? 'public';
  let source: PrismaService, clone: PrismaService;
  const quoted = (name: string) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) throw new Error('Unsafe schema identifier');
    return Prisma.raw(`"${name}"`);
  };
  beforeAll(async () => {
    source = new PrismaService(); await source.$connect();
    await source.$executeRaw(Prisma.sql`CREATE SCHEMA ${quoted(schema)}`);
    for (const name of [...requiredSchema.tables.map(table => table.name), '_prisma_migrations']) {
      await source.$executeRaw(Prisma.sql`CREATE TABLE ${quoted(schema)}.${quoted(name)} (LIKE ${quoted(sourceSchema)}.${quoted(name)} INCLUDING ALL)`);
    }
    await source.$executeRaw(Prisma.sql`INSERT INTO ${quoted(schema)}."_prisma_migrations" SELECT * FROM ${quoted(sourceSchema)}."_prisma_migrations"`);
    const url = new URL(originalUrl); url.searchParams.set('schema', schema);
    clone = new PrismaService({ datasources: { db: { url: url.toString() } } }); await clone.$connect();
    process.env.DATABASE_URL = url.toString();
  });
  afterAll(async () => {
    process.env.DATABASE_URL = originalUrl;
    if (clone) await clone.$disconnect();
    if (source) {
      if (!/^health_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test cleanup');
      await source.$executeRaw(Prisma.sql`DROP SCHEMA IF EXISTS ${quoted(schema)} CASCADE`); await source.$disconnect();
    }
  });
  it('accepts complete schema, rejects a missing migration, then recovers after its metadata is restored', async () => {
    const health = new HealthService(clone);
    expect(await health.ready()).toBe(true);
    const last = requiredSchema.migrations.at(-1)!.name;
    await clone.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = NULL WHERE migration_name = ${last}`;
    expect(await health.ready()).toBe(false);
    await clone.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = NOW() WHERE migration_name = ${last}`;
    expect(await health.ready()).toBe(true);
  });
  it('rejects a schema with a removed application column while source records remain untouched', async () => {
    const before = await source.user.count();
    await clone.$executeRaw`ALTER TABLE "FocusSession" DROP COLUMN "focusedSeconds"`;
    expect(await new HealthService(clone).ready()).toBe(false);
    expect(await source.user.count()).toBe(before);
  });
});
