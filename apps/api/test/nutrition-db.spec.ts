import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DiningSyncService } from '../src/integrations/dining/dining-sync.service';
import { PrismaService } from '../src/prisma.service';
const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;

databaseSuite('Nutrition diary, goals and dining hall', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string;
  const marker = `nutrition-${randomUUID()}`, client = () => request(app.getHttpServer());
  const nutrients = { kcal: 205, protein: 4.3, fat: 0.4, carbs: 44.5, fiber: 0.6 };
  const entry = (change: object = {}) => ({ requestKey: randomUUID(), date: '2026-10-20', meal: 'lunch', name: 'Rice, white, cooked', grams: 158, nutrients,
    source: 'usda', sourceRef: 'usda:168878', ...change });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'recorded-food-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') token = `Bearer ${response.body.accessToken}`; else otherToken = `Bearer ${response.body.accessToken}`;
    }
  });
  afterAll(async () => { if (db) { await db.user.deleteMany({ where: { email: { startsWith: marker } } }); await db.diningMenuDay.deleteMany({ where: { date: { in: ['2026-10-16', '2026-10-20'] } } }); } if (app) await app.close(); });

  it('searches USDA foods and own foods', async () => {
    const own = await client().post('/nutrition/foods').set('Authorization', token).send({ name: 'Protein shake', per100: { kcal: 60, protein: 10, fat: 1, carbs: 3, fiber: 0 },
      portions: [{ label: '1 bottle', grams: 330 }] }).expect(201);
    const found = await client().get('/nutrition/foods?q=rice').set('Authorization', token).expect(200);
    expect(found.body.foods[0].name).toBe('Rice, white, long-grain, regular, enriched, cooked');
    expect((await client().get('/nutrition/foods?q=shake').set('Authorization', token).expect(200)).body.foods[0]).toMatchObject({ id: own.body.id, source: 'own' });
    expect((await client().get('/nutrition/foods?q=protein shake').set('Authorization', otherToken).expect(200)).body.foods.some((food: { source: string }) => food.source === 'own')).toBe(false);
  });
  it('logs foods idempotently, edits and copies meals, and keeps diaries private', async () => {
    const input = entry();
    const [first, second] = await Promise.all([1, 2].map(() => client().post('/nutrition/entries').set('Authorization', token).send(input).expect(201)));
    expect(first.body.id).toBe(second.body.id);
    await client().post('/nutrition/entries').set('Authorization', token).send({ ...input, grams: 300 }).expect(409);
    await client().post('/nutrition/entries').set('Authorization', token).send(entry({ date: '2999-01-01' })).expect(400);
    const edited = await client().patch(`/nutrition/entries/${first.body.id}`).set('Authorization', token).send({ grams: 79, nutrients: { ...nutrients, kcal: 103 } }).expect(200);
    expect(edited.body).toMatchObject({ grams: 79, nutrients: { kcal: 103 } });
    await client().patch(`/nutrition/entries/${first.body.id}`).set('Authorization', otherToken).send({ meal: 'dinner' }).expect(404);
    expect((await client().post('/nutrition/entries/copy').set('Authorization', token).send({ fromDate: '2026-10-20', fromMeal: 'lunch', toDate: '2026-10-21', toMeal: 'lunch' }).expect(201)).body).toEqual({ copied: 1 });
    const day = await client().get('/nutrition/day/2026-10-21').set('Authorization', token).expect(200);
    expect(day.body.entries).toHaveLength(1);
    expect(day.body.recent[0]).toMatchObject({ id: 'usda:168878', portions: [{ label: 'Usual portion', grams: 79 }] });
    expect((await client().get('/nutrition/day/2026-10-21').set('Authorization', otherToken).expect(200)).body.entries).toEqual([]);
    await client().delete(`/nutrition/entries/${first.body.id}`).set('Authorization', otherToken).expect(404);
    await client().delete(`/nutrition/entries/${first.body.id}`).set('Authorization', token).expect(200);
  });
  it('saves the goal profile and shows the dining hall for Augustana courses or when switched on', async () => {
    const profile = { sex: 'male', birthYear: 2004, heightCm: 180, activity: 'moderate', goal: 'maintain', overrides: null, diningHall: 'auto' };
    await client().put('/nutrition/profile').set('Authorization', token).send(profile).expect(200);
    await client().put('/gym/body-weight/2026-10-20').set('Authorization', token).send({ weight: 176, unit: 'lb' }).expect(200);
    let day = await client().get('/nutrition/day/2026-10-20').set('Authorization', token).expect(200);
    expect(day.body).toMatchObject({ profile: { activity: 'moderate' }, latestWeightKg: 79.8, diningAvailable: false });
    await client().post('/courses').set('Authorization', token).send({ id: randomUUID(), name: 'Software Engineering', code: 'AUCSC 325' }).expect(201);
    day = await client().get('/nutrition/day/2026-10-20').set('Authorization', token).expect(200);
    expect(day.body.diningAvailable).toBe(true);
    await client().put('/nutrition/profile').set('Authorization', token).send({ ...profile, diningHall: 'off', overrides: { kcal: 2500 } }).expect(200);
    day = await client().get('/nutrition/day/2026-10-20').set('Authorization', token).expect(200);
    expect(day.body).toMatchObject({ diningAvailable: false, profile: { overrides: { kcal: 2500 } } });
  });
  it('stores a fetched menu, keeps it when a later read fails, and serves per-serving estimates', async () => {
    const sync = app.get(DiningSyncService);
    const html = readFileSync(path.join(__dirname, 'fixtures/wagner/menu-2026-10-16.html'), 'utf8');
    expect(await sync.refresh('2026-10-16', new Date(), (async () => new Response(html)) as unknown as typeof fetch)).toBe(true);
    expect(await sync.refresh('2026-10-16', new Date(), (async () => new Response('down', { status: 503 })) as unknown as typeof fetch)).toBe(false);
    const menu = await client().get('/nutrition/dining/2026-10-16').set('Authorization', token).expect(200);
    expect(menu.body).toMatchObject({ published: true, error: 'menu site answered 503' });
    const dish = menu.body.meals[0].stations.flatMap((station: { dishes: { name: string }[] }) => station.dishes).find((item: { name: string }) => item.name === 'Pork Sausage Patty');
    expect(dish).toMatchObject({ siteKcal: 55, kind: 'meat', serving: { nutrients: { kcal: 55 } } });
    expect((await client().get('/nutrition/dining/2026-10-20').set('Authorization', token).expect(200)).body).toMatchObject({ published: false, meals: [] });
  });
});
