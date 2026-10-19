import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { REGISTRATION_CONFIG } from '../src/auth-config';
import { AUTH_RATE_CONFIG, AuthRateService } from '../src/auth-rate';
import { RECOVERY_CONFIG } from '../src/auth-recovery/recovery-config';
import { RecoveryWorker } from '../src/auth-recovery/recovery-worker';
import { PrismaService } from '../src/prisma.service';

// Production-shaped unverified signup (ADR 018): shared quotas, no mail.
(process.env.DATABASE_URL ? describe : describe.skip)('unverified signup admission', () => {
  const namespace = `register-test-${randomUUID()}`, config = { mode: 'shared' as const, key: randomBytes(32) };
  let app: INestApplication, db: PrismaService;
  const register = (label: string) => request(app.getHttpServer()).post('/auth/register')
    .send({ email: `${namespace}-${label}@example.test`, password: 'register-test-123', displayName: 'Student', timeZone: 'America/Edmonton' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_RATE_CONFIG).useValue(config)
      .overrideProvider(AuthRateService).useFactory({ factory: (prisma: PrismaService) => new AuthRateService(prisma, config, namespace), inject: [PrismaService] })
      .overrideProvider(REGISTRATION_CONFIG).useValue({ mode: 'preview' }).overrideProvider(RECOVERY_CONFIG).useValue({ mode: 'disabled' })
      .overrideProvider(RecoveryWorker).useValue({}).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
  });
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { email: { startsWith: namespace } } });
      await db.recoveryRateBucket.deleteMany({ where: { key: { startsWith: namespace } } });
    }
    if (app) await app.close();
  });

  it('issues sessions, then limits one source to ten attempts an hour without creating accounts', async () => {
    const first = await register('first').expect(201);
    expect(first.body.accessToken).toEqual(expect.any(String));
    // A duplicate still counts, so the 409 cannot be used for unlimited address probing.
    await register('first').expect(409);
    for (let index = 0; index < 8; index++) await register(`bulk-${index}`).expect(201);
    await register('over-limit').expect(429);
    await register('first').expect(429);
    expect(await db.user.count({ where: { email: `${namespace}-over-limit@example.test` } })).toBe(0);
    expect(await db.user.count({ where: { email: { startsWith: namespace } } })).toBe(9);
  });
});
