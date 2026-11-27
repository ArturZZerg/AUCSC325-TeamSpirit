import { TodayService } from '../src/today';
import { PrismaService } from '../src/prisma.service';

const now = '2026-03-08T09:30:00.000Z';
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'freshness@example.test', displayName: 'Student', timeZone: 'America/Edmonton' };
const success = (at: string | null, lastError: string | null = null) => ({
  lastSuccessfulSyncAt: at ? new Date(at) : null, lastError,
  coveredFrom: '2026-03-01', coveredThrough: '2026-03-15',
});

describe('Canvas freshness in persisted Today reads (ToR 9, 10, 19; #189)', () => {
  const empty = () => ({ findMany: jest.fn().mockResolvedValue([]) });
  const prisma = {
    $transaction: jest.fn(), personalTask: empty(), taskCompletion: empty(), course: empty(),
    academicItem: empty(), goal: empty(), goalCompletion: empty(), event: empty(), savedEvent: empty(),
    canvasConnection: { findUnique: jest.fn() },
  };
  const today = new TodayService(prisma as unknown as PrismaService);
  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(new Date(now));
    prisma.$transaction.mockImplementation(async (read: (tx: typeof prisma) => Promise<unknown>) => read(prisma));
  });
  afterEach(() => { jest.useRealTimers(); });

  it.each([
    ['2026-03-08T08:00:00.001Z', 'available'],
    ['2026-03-08T08:00:00.000Z', 'stale'],
    ['2026-03-01T09:30:00.000Z', 'stale'],
    ['2026-03-08T09:30:00.001Z', 'stale'],
    [null, 'stale'],
  ])('reports a %s successful sync as %s in both endpoints', async (at, availability) => {
    prisma.canvasConnection.findUnique.mockResolvedValue(success(at));
    for (const result of [await today.snapshot(user, '2026-03-08'), await today.read(user, '2026-03-08')]) {
      expect(result.sourceStatus).toEqual({ lastSuccessfulSyncAt: at, availability,
        coveredFrom: '2026-03-01', coveredThrough: '2026-03-15' });
    }
  });
  it('uses elapsed UTC age across the fall repeated hour', async () => {
    jest.setSystemTime(new Date('2026-11-01T08:30:00Z'));
    prisma.canvasConnection.findUnique.mockResolvedValue(success('2026-11-01T07:00:00Z'));
    expect((await today.read(user, '2026-11-01')).sourceStatus.availability).toBe('stale');
  });
  it.each([null, '2026-03-08T09:29:00.000Z', '2026-03-01T09:30:00.000Z'])('keeps a failed source unavailable after success %s', async at => {
    prisma.canvasConnection.findUnique.mockResolvedValue(success(at, 'Canvas source unavailable or invalid'));
    expect((await today.snapshot(user)).sourceStatus.availability).toBe('unavailable');
  });
  it('keeps absent connections distinct from never-synced sources', async () => {
    prisma.canvasConnection.findUnique.mockResolvedValue(null);
    expect((await today.snapshot(user)).sourceStatus).toEqual({ availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null });
  });
});
