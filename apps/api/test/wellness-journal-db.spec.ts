import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addCalendarDays, localDateAt } from '@campusflow/domain';
import { accountExportSchema, wellnessJournalSchema } from '@campusflow/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { WellnessController } from '../src/wellness';
import { REGISTRATION_CONFIG } from '../src/auth-config';
import type { RequestUser } from '../src/common';

const suite = process.env.DATABASE_URL ? describe : describe.skip;
suite('Private reviewed wellness journal with PostgreSQL', () => {
  let app: INestApplication, db: PrismaService;
  const marker = `journal-${randomUUID()}`, date = '2025-03-09';
  type Owner = { accessToken: string; user: RequestUser };
  const client = () => request(app.getHttpServer());
  const register = async (timeZone = 'America/Edmonton'): Promise<Owner> => (await client().post('/auth/register').send({
    email: `${marker}-${randomUUID()}@example.test`, password: 'journal-fixture-password-123', displayName: 'Journal fixture', timeZone,
  }).expect(201)).body;
  const bearer = (owner: Owner) => `Bearer ${owner.accessToken}`;
  const fields = { mood: 4, energy: null, stress: 2, note: 'Private synthetic note' };
  const save = (owner: Owner, body: object, day = date) => client().put(`/wellness/journal/${day}`).set('Authorization', bearer(owner)).send(body);
  const read = (owner: Owner, from = date, through = date) => client().get(`/wellness/journal?from=${from}&through=${through}`).set('Authorization', bearer(owner));
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(REGISTRATION_CONFIG).useValue({ mode: 'preview' }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
  });
  afterAll(async () => { await db.user.deleteMany({ where: { email: { startsWith: marker } } }); await app.close(); });
  it('returns complete private empty coverage, creates and explicitly edits optional fields without leaking storage fields', async () => {
    const owner = await register(); const empty = await read(owner).expect(200);
    expect(empty.headers['cache-control']).toBe('private, no-store');
    expect(wellnessJournalSchema.parse(empty.body)).toMatchObject({ accountId: owner.user.id, entries: [], from: date, through: date });
    const created = await save(owner, { ...fields, expected: null }).expect(200);
    expect(created.body).toMatchObject({ ...fields, revision: 1, date }); expect(created.body.userId).toBeUndefined();
    const updated = await save(owner, { ...fields, mood: null, note: 'Reviewed replacement', expected: { id: created.body.id, revision: 1 } }).expect(200);
    expect(updated.body).toMatchObject({ mood: null, energy: null, stress: 2, note: 'Reviewed replacement', revision: 2 });
    expect(updated.body.id).toBe(created.body.id);
    const legacy = await client().get('/wellness').set('Authorization', bearer(owner)).expect(200);
    expect(legacy.headers['cache-control']).toBe('private, no-store'); expect(legacy.body[0].revision).toBeUndefined();
    const exported = await client().get('/me/export').set('Authorization', bearer(owner)).expect(200);
    expect(accountExportSchema.parse(exported.body).wellnessEntries[0].note).toBe('Reviewed replacement');
    expect(exported.body.wellnessEntries[0].revision).toBeUndefined();
  });
  it('admits exactly one simultaneous create and never replaces the winner', async () => {
    const owner = await register(); const replies = await Promise.all([save(owner, { ...fields, note: 'First fixture', expected: null }), save(owner, { ...fields, note: 'Second fixture', expected: null })]);
    expect(replies.map(reply => reply.status).sort()).toEqual([200, 409]);
    const rows = await read(owner).expect(200); expect(rows.body.entries).toHaveLength(1);
    expect(rows.body.entries[0].note).toBe(replies.find(reply => reply.status === 200)!.body.note);
  });
  it('admits exactly one edit of a reviewed version and rejects a stale delete without erasing the winner', async () => {
    const owner = await register(); const created = await save(owner, { ...fields, expected: null }).expect(200);
    const expected = { id: created.body.id, revision: 1 };
    const replies = await Promise.all([save(owner, { ...fields, note: 'One', expected }), save(owner, { ...fields, note: 'Two', expected })]);
    expect(replies.map(reply => reply.status).sort()).toEqual([200, 409]);
    await client().delete(`/wellness/journal/${date}`).set('Authorization', bearer(owner)).send({ expected }).expect(409);
    const current = (await read(owner).expect(200)).body.entries[0]; expect(current.revision).toBe(2);
    expect(current.note).toBe(replies.find(reply => reply.status === 200)!.body.note);
  });
  it('protects ownership, deletion confirmation and recreated identities even when revision is again one', async () => {
    const owner = await register(), other = await register(); const created = await save(owner, { ...fields, expected: null }).expect(200);
    const expected = { id: created.body.id, revision: 1 };
    await save(other, { ...fields, expected }).expect(409);
    await client().delete(`/wellness/journal/${date}`).set('Authorization', bearer(other)).send({ expected }).expect(409);
    expect((await read(other).expect(200)).body.entries).toEqual([]);
    await client().delete(`/wellness/journal/${date}`).set('Authorization', bearer(owner)).send({}).expect(400);
    await client().delete(`/wellness/journal/${date}`).set('Authorization', bearer(owner)).send({ expected }).expect(200).expect({ deleted: true });
    const replacement = await save(owner, { ...fields, note: 'Recreated', expected: null }).expect(200);
    expect(replacement.body.id).not.toBe(expected.id); expect(replacement.body.revision).toBe(1);
    await save(owner, { ...fields, expected }).expect(409); expect((await read(owner).expect(200)).body.entries[0].note).toBe('Recreated');
  });
  it('keeps legacy creation compatible while refusing blind replacement of a reviewed journal entry', async () => {
    const owner = await register(); const created = await client().post('/wellness').set('Authorization', bearer(owner)).send({ date, ...fields }).expect(201);
    await client().post('/wellness').set('Authorization', bearer(owner)).send({ date, ...fields, note: 'Blind replacement' }).expect(409);
    await save(owner, { ...fields, note: 'Reviewed legacy entry', expected: { id: created.body.id, revision: 1 } }).expect(200);
    expect((await read(owner).expect(200)).body.entries[0].note).toBe('Reviewed legacy entry');
  });
  it('validates complete bounded ranges and dates, and does not include entries outside the window', async () => {
    const owner = await register(); await save(owner, { ...fields, expected: null }).expect(200);
    await save(owner, { ...fields, expected: null }, '2025-02-28').expect(200);
    expect((await read(owner, '2025-03-01', '2025-03-31').expect(200)).body.entries).toHaveLength(1);
    await read(owner, '2025-03-01', '2025-04-01').expect(400); await read(owner, '2025-03-10', '2025-03-09').expect(400);
    await read(owner, '2025-02-29', date).expect(400); await save(owner, { ...fields, expected: null }, 'not-a-date').expect(400);
    await save(owner, { ...fields, mood: 6, expected: null }).expect(400);
    await save(owner, { mood: null, energy: null, stress: null, note: ' ', expected: null }).expect(400);
    await client().get(`/wellness/journal?from=${date}&through=${date}`).expect(401);
  });
  it('uses the account IANA day rather than the UTC or another account day for future-save rejection', async () => {
    const east = await register('Pacific/Kiritimati'), west = await register('Pacific/Honolulu');
    const day = localDateAt(new Date().toISOString(), east.user.timeZone);
    await save(east, { ...fields, expected: null }, day).expect(200);
    await save(west, { ...fields, expected: null }, day).expect(400);
    await save(east, { ...fields, expected: null }, addCalendarDays(day, 1)).expect(400);
  });
  it('cannot recreate owned journal data after an account erasure already holding the User lock', async () => {
    const owner = await register(); let opened!: () => void, release!: () => void;
    const locked = new Promise<void>(resolve => { opened = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const erased = db.$transaction(async tx => { await tx.user.delete({ where: { id: owner.user.id } }); opened(); await gate; }, { timeout: 10000 });
    await locked;
    const late = app.get(WellnessController).save(owner.user, date, { ...fields, expected: null });
    const observed = late.then(() => null, error => error);
    try {
      const deadline = Date.now() + 5000; let waiting = false;
      while (Date.now() < deadline && !waiting) {
        const rows = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%FROM "User"%FOR KEY SHARE%'`;
        waiting = Number(rows[0].count) > 0; if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
    } finally { release(); await erased; }
    expect((await observed)?.getStatus()).toBe(401); expect(await db.wellnessEntry.count({ where: { userId: owner.user.id } })).toBe(0);
  });
});
