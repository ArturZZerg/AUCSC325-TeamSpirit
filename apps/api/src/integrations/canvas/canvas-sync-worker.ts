import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { canvasConnectMode, CanvasService, fixtureBaseUrl } from '../../canvas';
import { PrismaService } from '../../prisma.service';

// Keeps token connections fresh without the student tapping "Sync now"
// (ADR 019). One API replica is assumed; per-account writes still take the
// advisory lock, so an overlapping manual sync stays consistent.
export const canvasSyncPolicy = { tickMs: 5 * 60_000, freshMs: 30 * 60_000, failedRetryMs: 6 * 60 * 60_000, perTick: 20 };

@Injectable()
export class CanvasSyncWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CanvasSyncWorker.name);
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<number>;
  private stopping = false;
  constructor(private readonly prisma: PrismaService, private readonly canvas: CanvasService) {}

  onApplicationBootstrap() { if (canvasConnectMode() === 'token' && process.env.NODE_ENV !== 'test') this.schedule(); }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearTimeout(this.timer); await this.running?.catch(() => undefined); }
  private schedule() {
    if (this.stopping) return;
    this.timer = setTimeout(() => { void this.runOnce().catch(() => this.logger.warn('Canvas background sync failed.')).finally(() => this.schedule()); }, canvasSyncPolicy.tickMs);
    this.timer.unref();
  }

  /** Syncs connections whose last attempt is stale; returns how many were attempted. */
  runOnce(now = new Date()): Promise<number> {
    if (this.stopping || canvasConnectMode() !== 'token') return Promise.resolve(0);
    if (!this.running) this.running = this.process(now).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async process(now: Date) {
    const fresh = new Date(now.getTime() - canvasSyncPolicy.freshMs), failed = new Date(now.getTime() - canvasSyncPolicy.failedRetryMs);
    const due = await this.prisma.canvasConnection.findMany({
      where: { baseUrl: { not: fixtureBaseUrl }, encryptedAccessToken: { startsWith: 'v1.' }, OR: [
        { lastSyncAttemptAt: null },
        { lastError: null, lastSyncAttemptAt: { lt: fresh } },
        // A revoked or expired token fails every time; retry rarely until the student reconnects.
        { lastError: { not: null }, lastSyncAttemptAt: { lt: failed } },
      ] },
      select: { userId: true }, orderBy: { lastSyncAttemptAt: { sort: 'asc', nulls: 'first' } }, take: canvasSyncPolicy.perTick,
    });
    let failures = 0;
    for (const { userId } of due) {
      if (this.stopping) break;
      // Failures are already recorded on the connection; never log account or Canvas details.
      try { await this.canvas.syncAccount(userId); } catch { failures += 1; }
    }
    if (failures) this.logger.warn(`Canvas background sync: ${failures} of ${due.length} accounts did not sync.`);
    return due.length;
  }
}
