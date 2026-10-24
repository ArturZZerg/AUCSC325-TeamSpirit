import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;

databaseSuite('Gym enrollment and recorded workouts', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string, userId: string;
  const marker = `gym-${randomUUID()}`, client = () => request(app.getHttpServer());
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const body = () => ({ requestKey: randomUUID(), programId: 'upper-lower', dayId: 'upper-a', title: 'Upper A',
    startedAt: minutesAgo(70), endedAt: minutesAgo(5), unit: 'kg', note: null,
    exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'recorded-gym-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`; } else otherToken = `Bearer ${response.body.accessToken}`;
    }
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });

  it('enrolls in a catalog program, keeps the start when only settings change and restarts on a switch', async () => {
    const empty = await client().get('/gym').set('Authorization', token).expect(200);
    expect(empty.headers['cache-control']).toBe('private, no-store');
    expect(empty.body).toMatchObject({ accountId: userId, timeZone: 'America/Edmonton', enrollment: null, workouts: [] });
    await client().put('/gym/enrollment').set('Authorization', token).send({ programId: 'not-a-program', unit: 'kg', weeklyTarget: 3 }).expect(400);
    const first = await client().put('/gym/enrollment').set('Authorization', token).send({ programId: 'upper-lower', unit: 'kg', weeklyTarget: 4 }).expect(200);
    const changed = await client().put('/gym/enrollment').set('Authorization', token).send({ programId: 'upper-lower', unit: 'lb', weeklyTarget: 3 }).expect(200);
    expect(changed.body).toMatchObject({ unit: 'lb', weeklyTarget: 3, startedAt: first.body.startedAt });
    const switched = await client().put('/gym/enrollment').set('Authorization', token).send({ programId: 'push-pull-legs', unit: 'lb', weeklyTarget: 6 }).expect(200);
    expect(Date.parse(switched.body.startedAt)).toBeGreaterThanOrEqual(Date.parse(first.body.startedAt));
    expect((await client().get('/gym').set('Authorization', otherToken).expect(200)).body.enrollment).toBeNull();
    await client().delete('/gym/enrollment').set('Authorization', token).expect(200);
    expect((await client().get('/gym').set('Authorization', token).expect(200)).body.enrollment).toBeNull();
  });
  it('saves a workout once across concurrent retries and rejects a reused key with different sets', async () => {
    const input = body();
    const results = await Promise.all(Array.from({ length: 3 }, () => client().post('/gym/workouts').set('Authorization', token).send(input).expect(201)));
    expect(new Set(results.map(result => result.body.id)).size).toBe(1);
    expect(results[0].body.userId).toBeUndefined(); expect(results[0].body.requestHash).toBeUndefined();
    expect(await db.workout.count({ where: { userId, requestKey: input.requestKey } })).toBe(1);
    await client().post('/gym/workouts').set('Authorization', token).send({ ...input, note: 'Changed' }).expect(409);
    const overview = await client().get('/gym').set('Authorization', token).expect(200);
    expect(overview.body.workouts.map((row: { id: string }) => row.id)).toContain(results[0].body.id);
  });
  it('isolates history and deletion by account', async () => {
    const saved = await client().post('/gym/workouts').set('Authorization', token).send(body()).expect(201);
    expect((await client().get('/gym').set('Authorization', otherToken).expect(200)).body.workouts).toEqual([]);
    await client().delete(`/gym/workouts/${saved.body.id}`).set('Authorization', otherToken).expect(404);
    await client().delete(`/gym/workouts/${saved.body.id}`).set('Authorization', token).expect(200);
    await client().delete(`/gym/workouts/${saved.body.id}`).set('Authorization', token).expect(404);
  });
  it('accepts swapped exercises but rejects unknown ones, wrong load kinds, future workouts and anonymous access', async () => {
    const send = (change: object) => client().post('/gym/workouts').set('Authorization', token).send({ ...body(), ...change });
    await send({ dayId: 'push-a' }).expect(400);
    await send({ exercises: [{ exerciseId: 'back-squat', sets: [{ weight: 100, reps: 5, rir: 2 }] }, { exerciseId: 'Barbell_Shrug', sets: [{ weight: 60, reps: 12 }] }] }).expect(201);
    await send({ exercises: [{ exerciseId: 'not-an-exercise', sets: [{ weight: 100, reps: 5 }] }] }).expect(400);
    await send({ exercises: [{ exerciseId: 'bench-press', sets: [{ weight: null, reps: 5 }] }] }).expect(400);
    await send({ programId: 'dorm-room-starter', dayId: 'a', exercises: [{ exerciseId: 'incline-push-up', sets: [{ weight: 10, reps: 5 }] }] }).expect(400);
    await send({ programId: 'dorm-room-starter', dayId: 'a', exercises: [{ exerciseId: 'incline-push-up', sets: [{ weight: null, reps: 12 }] }] }).expect(201);
    await send({ startedAt: new Date(Date.now() + 3600_000).toISOString(), endedAt: new Date(Date.now() + 7200_000).toISOString() }).expect(400);
    await client().get('/gym').expect(401);
  });
  it('creates, edits and enrolls in an own program with own and library exercises', async () => {
    const own = await client().post('/gym/exercises').set('Authorization', token).send({ name: 'Wrist roller', equipment: 'other', load: 'external',
      muscles: ['forearms'], note: null, mediaId: null }).expect(201);
    await client().post('/gym/exercises').set('Authorization', token).send({ name: 'Bad', equipment: 'other', load: 'external', muscles: ['core'], note: null, mediaId: 'Nope' }).expect(400);
    const day = { id: 'arms', name: 'Arms', focus: 'Grip', exercises: [{ exerciseId: own.body.id, sets: 2, repMin: 10, repMax: 15, restSeconds: 60 },
      { exerciseId: 'Hammer_Curls', sets: 3, repMin: 8, repMax: 12, restSeconds: 90, note: 'Slow' }] };
    await client().post('/gym/programs').set('Authorization', token).send({ name: 'Bad', days: [{ ...day, exercises: [{ ...day.exercises[0], exerciseId: randomUUID() }] }] }).expect(400);
    await client().post('/gym/programs').set('Authorization', otherToken).send({ name: 'Theirs', days: [day] }).expect(400);
    const program = await client().post('/gym/programs').set('Authorization', token).send({ name: 'Grip', days: [day] }).expect(201);
    const renamed = await client().put(`/gym/programs/${program.body.id}`).set('Authorization', token).send({ name: 'Grip & arms', days: [day] }).expect(200);
    expect(renamed.body).toMatchObject({ name: 'Grip & arms', days: [day] });
    await client().put(`/gym/programs/${program.body.id}`).set('Authorization', otherToken).send({ name: 'x', days: [{ ...day, exercises: [day.exercises[1]] }] }).expect(404);
    await client().put('/gym/enrollment').set('Authorization', otherToken).send({ programId: program.body.id, unit: 'kg', weeklyTarget: 3 }).expect(400);
    const enrolled = await client().put('/gym/enrollment').set('Authorization', token).send({ programId: program.body.id, unit: 'kg', weeklyTarget: 3, trackRir: true }).expect(200);
    expect(enrolled.body).toMatchObject({ programId: program.body.id, trackRir: true });
    await client().post('/gym/workouts').set('Authorization', token).send({ ...body(), programId: program.body.id, dayId: 'arms', title: 'Arms',
      exercises: [{ exerciseId: own.body.id, sets: [{ weight: 5, reps: 15, rir: 1 }] }] }).expect(201);
    await client().delete(`/gym/exercises/${own.body.id}`).set('Authorization', token).expect(409);
    const overview = await client().get('/gym').set('Authorization', token).expect(200);
    expect(overview.body.exercises.map((item: { id: string }) => item.id)).toContain(own.body.id);
    expect(overview.body.programs.map((item: { id: string }) => item.id)).toContain(program.body.id);
    await client().delete(`/gym/programs/${program.body.id}`).set('Authorization', token).expect(200);
    expect((await client().get('/gym').set('Authorization', token).expect(200)).body.enrollment).toBeNull();
  });
  it('records one body weight per account date and rejects future dates', async () => {
    await client().put('/gym/body-weight/2026-10-20').set('Authorization', token).send({ weight: 72.4, unit: 'kg' }).expect(200);
    await client().put('/gym/body-weight/2026-10-20').set('Authorization', token).send({ weight: 72.1, unit: 'kg' }).expect(200);
    await client().put('/gym/body-weight/2999-01-01').set('Authorization', token).send({ weight: 72, unit: 'kg' }).expect(400);
    await client().put('/gym/body-weight/2026-10-21').set('Authorization', token).send({ weight: 5, unit: 'kg' }).expect(400);
    const overview = await client().get('/gym').set('Authorization', token).expect(200);
    expect(overview.body.bodyWeights.filter((entry: { date: string }) => entry.date === '2026-10-20')).toEqual([{ date: '2026-10-20', weight: 72.1, unit: 'kg' }]);
    await client().delete('/gym/body-weight/2026-10-20').set('Authorization', token).expect(200);
    await client().delete('/gym/body-weight/2026-10-20').set('Authorization', token).expect(404);
  });
  it('serves library instructions for known exercises only', async () => {
    const details = await client().get('/gym/exercises/Barbell_Full_Squat/details').set('Authorization', token).expect(200);
    expect(details.body.instructions.length).toBeGreaterThan(1);
    await client().get('/gym/exercises/Not_An_Exercise/details').set('Authorization', token).expect(404);
  });
  it('imports an openGym backup idempotently and enrolls the student in it', async () => {
    const registered = await client().post('/auth/register').send({ email: `${marker}-import@example.test`, displayName: 'Importer',
      password: 'recorded-gym-test-123', timeZone: 'America/Edmonton' }).expect(201);
    const importer = `Bearer ${registered.body.accessToken}`;
    const backup = readFileSync(path.join(__dirname, 'fixtures/opengym/state.json'));
    const upload = () => client().post('/gym/import/opengym').set('Authorization', importer).set('Content-Type', 'application/octet-stream').send(backup);
    const first = await upload().expect(200);
    expect(first.body).toMatchObject({ exercises: 3, programs: 1, workouts: 2, bodyWeights: 2, skipped: 2 });
    const again = await upload().expect(200);
    expect(again.body).toMatchObject({ exercises: 0, programs: 0, workouts: 0, bodyWeights: 0, programId: first.body.programId });
    const overview = await client().get('/gym').set('Authorization', importer).expect(200);
    expect(overview.body.enrollment).toMatchObject({ programId: first.body.programId, unit: 'lb', weeklyTarget: 2, trackRir: true });
    expect(overview.body.workouts).toHaveLength(2);
    expect(overview.body.programs[0].days.map((day: { id: string; archived?: boolean }) => [day.id, !!day.archived])).toEqual([['day-push', false], ['day-pull', false], ['day-copy', true]]);
    await client().post('/gym/import/opengym').set('Authorization', importer).set('Content-Type', 'application/json').send({ unit: 'lb' }).expect(415);
    await client().post('/gym/import/opengym').set('Authorization', importer).set('Content-Type', 'application/octet-stream').send(Buffer.from('{"hello":1}')).expect(400);
  });
  it('exports enrollment and workouts and erases them with the account', async () => {
    await client().put('/gym/enrollment').set('Authorization', otherToken).send({ programId: 'dorm-room-starter', unit: 'kg', weeklyTarget: 3 }).expect(200);
    await client().post('/gym/workouts').set('Authorization', otherToken).send({ ...body(), programId: 'dorm-room-starter', dayId: 'b',
      exercises: [{ exerciseId: 'push-up', sets: [{ weight: null, reps: 10 }] }] }).expect(201);
    const exported = await client().get('/me/export').set('Authorization', otherToken).expect(200);
    expect(exported.body.gymEnrollment).toMatchObject({ programId: 'dorm-room-starter' });
    expect(exported.body.workouts).toHaveLength(1);
    const otherId = exported.body.profile.id;
    await client().delete('/me').set('Authorization', otherToken).send({ currentPassword: 'recorded-gym-test-123', confirmation: 'DELETE' }).expect(200);
    expect(await db.workout.count({ where: { userId: otherId } })).toBe(0);
    expect(await db.gymEnrollment.count({ where: { userId: otherId } })).toBe(0);
  });
});
