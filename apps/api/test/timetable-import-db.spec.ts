import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Temporal } from '@js-temporal/polyfill';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('timetable import preview endpoint', () => {
  let app: INestApplication, db: PrismaService, token: string, other: string;
  const marker = `timetable-import-${randomUUID()}`, client = () => request(app.getHttpServer());
  // A series that starts next Monday, so the test never ages into "finished".
  const monday = Temporal.Now.plainDateISO('America/Edmonton').add({ days: 7 }).with({ day: 1 }).add({ months: 1 });
  const start = monday.add({ days: (8 - monday.dayOfWeek) % 7 }).toString().replace(/-/g, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', 'BEGIN:VEVENT', 'UID:lecture', 'DTSTAMP:20260901T000000Z',
    'SUMMARY:Psychology lecture', 'LOCATION:Arts 101', `DTSTART;TZID=America/Edmonton:${start}T100000`, `DTEND;TZID=America/Edmonton:${start}T105000`,
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const upload = (body: string | Buffer, auth = token, type = 'text/calendar; charset=utf-8') =>
    client().post('/classes/import-preview').set('Authorization', auth).set('Content-Type', type).send(body);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    const register = async (label: string) => `Bearer ${(await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`,
      displayName: label, password: 'timetable-import-123', timeZone: 'America/Edmonton' }).expect(201)).body.accessToken}`;
    token = await register('first'); other = await register('second');
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });

  it('previews weekly classes without saving anything', async () => {
    const response = await upload(ics).expect(200);
    expect(response.body.classes).toEqual([expect.objectContaining({ title: 'Psychology lecture', weekdays: [1, 3], startTime: '10:00',
      endTime: '10:50', location: 'Arts 101', meetings: 10, duplicateOf: null })]);
    expect((await client().get('/classes').set('Authorization', token).expect(200)).body).toEqual([]);
  });

  it('marks a class the student already saved, but not one saved by another account', async () => {
    const { body: draft } = await upload(ics);
    const { meetings: _meetings, duplicateOf: _duplicate, ...fields } = draft.classes[0];
    const saved = await client().post('/classes').set('Authorization', other).send(fields).expect(201);
    expect((await upload(ics).expect(200)).body.classes[0].duplicateOf).toBeNull();
    expect((await upload(ics, other).expect(200)).body.classes[0].duplicateOf).toBe(saved.body.id);
  });

  it('requires a session', async () => { await upload(ics, '').expect(401); });
  it('accepts only calendar uploads', async () => {
    expect((await upload(ics, token, 'text/plain').expect(415)).body.message).toContain('.ics');
    await upload(ics, token, 'application/json').expect(400);
  });
  it('refuses files over 1 MB', async () => {
    expect((await upload('X'.repeat(1024 * 1024 + 1)).expect(413)).body.message).toContain('1 MB');
  });
  it('explains unreadable and class-free files', async () => {
    expect((await upload(Buffer.from([0xff, 0xfe, 0x00, 0x41])).expect(400)).body.message).toContain('readable');
    expect((await upload('BEGIN:VCALENDAR\r\nnot a calendar').expect(422)).body.message).toContain('couldn’t read');
    expect((await upload(ics.replace('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10', '')).expect(200)).body).toMatchObject({ classes: [], skipped: { oneTime: 1 } });
  });
});
