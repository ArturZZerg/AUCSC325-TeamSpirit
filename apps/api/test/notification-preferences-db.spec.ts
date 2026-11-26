import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('paired quiet-hours updates with PostgreSQL (ToR 13, #197)', () => {
  let app: INestApplication, db: PrismaService, token: string, userId: string;
  const email = `quiet-hours-${Date.now()}@example.test`;
  const pair = { quietHoursStart: '22:00', quietHoursEnd: '07:00' };
  const disabled = { quietHoursStart: null, quietHoursEnd: null };
  const client = () => request(app.getHttpServer());
  const patch = (body: object) => client().patch('/notification-preferences').set('Authorization', token).send(body);
  const stored = () => db.notificationPreference.findUniqueOrThrow({ where: { userId } });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    const response = await client().post('/auth/register').send({ email, password: 'quiet-hours-password-123',
      displayName: 'Student', timeZone: 'America/Edmonton' }).expect(201);
    userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`;
  });
  beforeEach(async () => { await db.notificationPreference.upsert({ where: { userId }, create: { userId }, update: disabled }); });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email } }); if (app) await app.close(); });

  it.each([disabled, pair])('rejects incomplete edits without changing stored state: %j', async initial => {
    await patch(initial).expect(200);
    for (const body of [
      { quietHoursStart: '23:00' }, { quietHoursEnd: '08:00' },
      { quietHoursStart: null }, { quietHoursEnd: null },
      { quietHoursStart: '22:00', quietHoursEnd: null },
      { quietHoursStart: null, quietHoursEnd: '07:00' },
    ]) {
      const before = await stored();
      await patch({ ...body, personalEnabled: !before.personalEnabled }).expect(400);
      expect(await stored()).toEqual(before);
    }
  });

  it('does not create preferences from an incomplete first PATCH', async () => {
    await db.notificationPreference.delete({ where: { userId } });
    await patch({ quietHoursStart: '22:00' }).expect(400);
    expect(await db.notificationPreference.findUnique({ where: { userId } })).toBeNull();
    expect((await patch(pair).expect(200)).body).toMatchObject(pair);
  });

  it('sets, changes and clears both bounds while category-only updates preserve them', async () => {
    for (const value of [pair, { quietHoursStart: '12:00', quietHoursEnd: '14:00' }, disabled]) {
      expect((await patch(value).expect(200)).body).toMatchObject(value);
      expect((await patch({ goalEnabled: false }).expect(200)).body).toMatchObject({ ...value, goalEnabled: false });
      expect((await client().get('/notification-preferences').set('Authorization', token).expect(200)).body).toMatchObject(value);
    }
  });

  it('migrates old incomplete bounds to disabled without altering valid pairs or categories', async () => {
    const migration = readFileSync(join(__dirname, '../prisma/migrations/20261124000000_quiet_hours_pairs/migration.sql'), 'utf8');
    await db.$transaction(async tx => {
      // A temporary table shadows the real table only for this transaction.
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "NotificationPreference" (id int, "quietHoursStart" text, "quietHoursEnd" text, "personalEnabled" boolean) ON COMMIT DROP');
      await tx.$executeRawUnsafe(`INSERT INTO "NotificationPreference" VALUES
        (1, '22:00', NULL, false), (2, NULL, '07:00', true),
        (3, '22:00', '07:00', false), (4, NULL, NULL, true), (5, '07:00', '07:00', false)`);
      await tx.$executeRawUnsafe(migration);
      expect(await tx.$queryRawUnsafe('SELECT * FROM "NotificationPreference" ORDER BY id')).toEqual([
        { id: 1, ...disabled, personalEnabled: false }, { id: 2, ...disabled, personalEnabled: true },
        { id: 3, ...pair, personalEnabled: false }, { id: 4, ...disabled, personalEnabled: true },
        { id: 5, quietHoursStart: '07:00', quietHoursEnd: '07:00', personalEnabled: false },
      ]);
    });
  });
});
