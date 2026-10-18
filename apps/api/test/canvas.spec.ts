import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return {
    ...actual,
    Prisma: {
      ...actual.Prisma,
      TransactionIsolationLevel: { ReadCommitted: 'ReadCommitted' },
    },
  };
});
import { AuthGuard, RequestUser } from '../src/common';
import { CanvasController, CanvasService, fixtureBaseUrl, fixtureSource } from '../src/canvas';
import { CanvasProvider, FixtureCanvasProvider } from '../src/integrations/canvas/canvas-provider';
import { PrismaService } from '../src/prisma.service';

const user: RequestUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'canvas-test@example.test',
  displayName: 'Canvas Test',
  timeZone: 'America/Edmonton',
};

type PrismaMock = {
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
  session: { findUnique: jest.Mock };
  canvasConnection: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock };
  course: { upsert: jest.Mock };
  academicItem: { upsert: jest.Mock };
};

const createPrismaMock = (): PrismaMock => ({
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
  session: { findUnique: jest.fn() },
  canvasConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  course: { upsert: jest.fn() },
  academicItem: { upsert: jest.fn() },
});

describe('Canvas black-box HTTP behavior', () => {
  let app: INestApplication;
  let prisma: PrismaMock;
  let provider: { fetchAcademicSnapshot: jest.Mock };

  beforeAll(async () => {
    prisma = createPrismaMock();
    provider = { fetchAcademicSnapshot: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [CanvasController],
      providers: [
        AuthGuard,
        CanvasService,
        { provide: PrismaService, useValue: prisma },
        { provide: CanvasProvider, useValue: provider },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.CANVAS_MODE = 'fixture';
    prisma.$transaction.mockImplementation(async (work: (tx: PrismaMock) => Promise<unknown>) => work(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.session.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date('2099-01-01'),
      user,
    });
    prisma.canvasConnection.findUnique.mockResolvedValue(null);
    prisma.canvasConnection.upsert.mockResolvedValue({
      userId: user.id,
      baseUrl: fixtureBaseUrl,
      externalAccountId: `fixture-${user.id}`,
      encryptedAccessToken: 'fixture',
      lastSuccessfulSyncAt: null,
      lastSyncAttemptAt: null,
      lastError: null,
    });
    provider.fetchAcademicSnapshot.mockResolvedValue(new FixtureCanvasProvider().fetchAcademicSnapshot());
    prisma.course.upsert.mockResolvedValue({ id: 'course-id' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('connects and synchronizes a fixture through the public HTTP contract', async () => {
    const client = () => request(app.getHttpServer());

    await client().post('/canvas/dev/connect').set('Authorization', 'Bearer test-token').send({}).expect(201).expect({ connected: true, mode: 'fixture' });
    prisma.canvasConnection.findUnique.mockResolvedValue({
      baseUrl: fixtureBaseUrl,
      externalAccountId: `fixture-${user.id}`,
    });

    const response = await client().post('/canvas/sync').set('Authorization', 'Bearer test-token').send({}).expect(201);

    expect(response.body).toMatchObject({
      coursesUpdated: 2,
      academicItemsUpdated: 3,
      eventsUpdated: 0,
      status: 'succeeded',
    });
    expect(prisma.course.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.academicItem.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.canvasConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: user.id },
      create: expect.objectContaining({
        userId: user.id,
        baseUrl: fixtureBaseUrl,
      }),
    }));
  });

  it('rejects missing authentication and invalid mutation input', async () => {
    await request(app.getHttpServer()).get('/canvas/status').expect(401);
    await request(app.getHttpServer())
      .post('/canvas/dev/connect')
      .set('Authorization', 'Bearer test-token')
      .send({ accessToken: 'must-not-be-accepted' })
      .expect(400);
    expect(prisma.canvasConnection.upsert).not.toHaveBeenCalled();
  });
});

describe('Canvas service functional behavior', () => {
  let prisma: PrismaMock;
  let provider: { fetchAcademicSnapshot: jest.Mock };
  let service: CanvasService;

  beforeEach(() => {
    prisma = createPrismaMock();
    provider = { fetchAcademicSnapshot: jest.fn() };
    prisma.$transaction.mockImplementation(async (work: (tx: PrismaMock) => Promise<unknown>) => work(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.canvasConnection.findUnique.mockResolvedValue({
      baseUrl: fixtureBaseUrl,
      externalAccountId: `fixture-${user.id}`,
    });
    prisma.canvasConnection.upsert.mockResolvedValue({});
    prisma.course.upsert.mockResolvedValue({ id: 'course-id' });
    provider.fetchAcademicSnapshot.mockResolvedValue(new FixtureCanvasProvider().fetchAcademicSnapshot());
    service = new CanvasService(prisma as unknown as PrismaService, provider as unknown as CanvasProvider);
    process.env.NODE_ENV = 'test';
    process.env.CANVAS_MODE = 'fixture';
  });

  it('upserts normalized academic records and reports the imported counts', async () => {
    const result = await service.sync(user);

    expect(result).toMatchObject({
      coursesUpdated: 2,
      academicItemsUpdated: 3,
      status: 'succeeded',
    });
    expect(prisma.course.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId_source_externalId: {
          userId: user.id,
          source: fixtureSource,
          externalId: expect.any(String),
        },
      },
    }));
    expect(prisma.academicItem.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.canvasConnection.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: null }),
    }));
  });

  it('records a sanitized provider failure and skips entity persistence', async () => {
    provider.fetchAcademicSnapshot.mockRejectedValue(new Error('private token leaked by provider'));

    await expect(service.sync(user)).rejects.toThrow('Canvas source unavailable or invalid');

    expect(prisma.canvasConnection.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { lastSyncAttemptAt: expect.any(Date), lastError: 'Canvas source unavailable or invalid' },
    }));
    expect(prisma.course.upsert).not.toHaveBeenCalled();
    expect(prisma.academicItem.upsert).not.toHaveBeenCalled();
  });
});
