import { RecoveryWorker } from '../src/auth-recovery/recovery-worker';
import { RecoveryConfig } from '../src/auth-recovery/recovery-config';
import { RecoveryMailer } from '../src/auth-recovery/recovery-mail';
import { RecoveryService } from '../src/auth-recovery/recovery-service';
import { RecoveryRateService } from '../src/auth-recovery/recovery-rate';
import { PrismaService } from '../src/prisma.service';
import { Test } from '@nestjs/testing';
import { RECOVERY_CONFIG } from '../src/auth-recovery/recovery-config';
import { RECOVERY_MAILER } from '../src/auth-recovery/recovery-mail';

describe('recovery capability and worker lifecycle', () => {
  const config: RecoveryConfig = { mode: 'disabled' };
  const send = jest.fn(), execute = jest.fn().mockResolvedValue(0);
  const db = { $executeRaw: execute } as unknown as PrismaService;
  const port: RecoveryMailer = { send };
  beforeEach(() => { jest.useFakeTimers(); execute.mockReset().mockResolvedValue(0); send.mockReset(); });
  afterEach(() => jest.useRealTimers());
  it('reports disabled capability and fails requests/resets honestly without touching records or delivery', async () => {
    const rates = { record: jest.fn() } as unknown as RecoveryRateService, service = new RecoveryService(db, rates, config);
    expect(service.capability()).toEqual({ available: false, expiresInMinutes: 15 });
    await expect(service.request({ email: 'student@example.test' }, 'source')).rejects.toMatchObject({ status: 503 });
    await expect(service.reset({ email: 'student@example.test', code: 'A'.repeat(30), newPassword: 'long-new-password' }, 'source')).rejects.toMatchObject({ status: 503 });
    expect(rates.record).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
  });
  it('periodically cleans expired private metadata while disabled and cancels polling at shutdown', async () => {
    const worker = new RecoveryWorker(db, config, port); worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60_000); expect(execute).toHaveBeenCalledTimes(3); expect(send).not.toHaveBeenCalled();
    await worker.onModuleDestroy(); await jest.advanceTimersByTimeAsync(60_000);
    expect(execute).toHaveBeenCalledTimes(3); expect(jest.getTimerCount()).toBe(0);
  });
  it('deduplicates concurrent manual runs and waits for an active operation before shutdown', async () => {
    let release!: () => void;
    execute.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const worker = new RecoveryWorker(db, config, port), first = worker.runOnce(), second = worker.runOnce();
    expect(first).toBe(second); expect(execute).toHaveBeenCalledTimes(1);
    let closed = false; const shuttingDown = worker.onModuleDestroy().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false); release(); await Promise.all([first, shuttingDown]);
    expect(closed).toBe(true); expect(execute).toHaveBeenCalledTimes(3);
    await worker.runOnce(); expect(execute).toHaveBeenCalledTimes(3);
  });
  it('drains the real Nest worker lifecycle before disconnecting its Prisma provider', async () => {
    const prisma = new PrismaService();
    const connect = jest.spyOn(prisma, '$connect').mockResolvedValue(undefined), disconnect = jest.spyOn(prisma, '$disconnect').mockResolvedValue(undefined);
    let release!: () => void;
    const query = jest.spyOn(prisma, '$executeRaw').mockResolvedValue(0);
    query.mockImplementationOnce(() => new Promise<number>(resolve => { release = () => resolve(0); }) as ReturnType<PrismaService['$executeRaw']>);
    const module = await Test.createTestingModule({ providers: [RecoveryWorker, { provide: PrismaService, useValue: prisma },
      { provide: RECOVERY_CONFIG, useValue: config }, { provide: RECOVERY_MAILER, useValue: port }] }).compile();
    const app = module.createNestApplication(); await app.init();
    const running = app.get(RecoveryWorker).runOnce(), closing = app.close();
    try {
      await jest.advanceTimersByTimeAsync(0); expect(connect).toHaveBeenCalledTimes(1); expect(disconnect).not.toHaveBeenCalled();
    } finally { release(); await Promise.all([running, closing]); connect.mockRestore(); query.mockRestore(); }
    expect(disconnect).toHaveBeenCalledTimes(1); disconnect.mockRestore();
  });
});
