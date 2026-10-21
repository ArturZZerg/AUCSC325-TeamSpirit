import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { canvasConnectionStatusSchema, canvasSyncResultSchema, canvasTokenConnectSchema, type CanvasTokenConnect } from '@campusflow/contracts';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe } from './common';
import { ReminderService } from './data';
import { PrismaService } from './prisma.service';
import { AcademicSnapshot, academicSnapshotSchema, CanvasProvider } from './integrations/canvas/canvas-provider';
import { CanvasFailure, CanvasHttpClient, CanvasRequestError } from './integrations/canvas/canvas-http';
import { canvasTokenKey, isSealedCanvasToken, openCanvasToken, sealCanvasToken } from './integrations/canvas/canvas-token';

export const fixtureBaseUrl = 'https://canvas.fixture.local';
// Fixtures cannot overwrite records from an institutional connection.
export const fixtureSource = 'canvas:fixture';
/** Records imported with a student's own access token (ADR 019). */
export const canvasSource = 'canvas';
type Tx = Prisma.TransactionClient;
const emptyBody = z.object({}).strict().default({});
const oauthUnavailable = () => new ServiceUnavailableException('Canvas OAuth is disabled until this deployment has an institution-approved developer key and HTTPS callback.');

/** token: personal access tokens (ADR 019); fixture: development data only. */
export function canvasConnectMode(env: NodeJS.ProcessEnv = process.env): 'token' | 'fixture' | 'unavailable' {
  if (env.CANVAS_MODE === 'token') return 'token';
  return ['development', 'test'].includes(env.NODE_ENV ?? '') && env.CANVAS_MODE === 'fixture' ? 'fixture' : 'unavailable';
}
// Student-facing and stored error text. Never includes Canvas responses or tokens.
const failures: Record<CanvasFailure, string> = {
  'invalid-url': 'That doesn’t look like a Canvas address. Use the address you open Canvas with, such as school.instructure.com.',
  unauthorized: 'Canvas didn’t accept this access token. Create a new token in Canvas and connect again.',
  unreachable: 'Canvas couldn’t be reached. Try again in a moment.',
  'invalid-response': 'Canvas returned data CampusFlow couldn’t read. Try again later.',
};
const liveTimeoutMs = 25000;

@Injectable()
export class CanvasService {
  constructor(private readonly prisma: PrismaService, private readonly provider: CanvasProvider, private readonly reminders: ReminderService,
    private readonly http: CanvasHttpClient) {}
  private assertFixtureEnabled(): void {
    if (canvasConnectMode() !== 'fixture') throw new ForbiddenException('Canvas fixtures require explicit development/test fixture mode');
  }
  private tokenKey(): Buffer {
    try { return canvasTokenKey(); } catch { throw new ServiceUnavailableException('Canvas token storage is not configured on this server.'); }
  }
  private async withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), liveTimeoutMs);
    try { return await work(controller.signal); }
    catch (error) { throw error instanceof CanvasRequestError ? error : new CanvasRequestError('unreachable'); }
    finally { clearTimeout(timer); }
  }
  async connectFixture(user: RequestUser) {
    this.assertFixtureEnabled();
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('canvas'), hashtext(${user.id}))::text`;
      const existing = await tx.canvasConnection.findUnique({ where: { userId: user.id } });
      if (existing && (existing.baseUrl !== fixtureBaseUrl || existing.externalAccountId !== `fixture-${user.id}`))
        throw new ForbiddenException('Fixtures cannot replace an institutional Canvas connection');
      await tx.canvasConnection.upsert({
        where: { userId: user.id },
        create: { userId: user.id, baseUrl: fixtureBaseUrl, externalAccountId: `fixture-${user.id}`, encryptedAccessToken: 'fixture' },
        // Retries preserve successful freshness and history.
        update: {},
      });
      return { connected: true, mode: 'fixture' as const };
    }, { timeout: 30000, maxWait: 10000 });
  }
  /** Verifies the token with Canvas, then stores it sealed. The token is never returned or logged. */
  async connectToken(user: RequestUser, body: CanvasTokenConnect) {
    if (canvasConnectMode() !== 'token') throw oauthUnavailable();
    const key = this.tokenKey();
    let verified: { origin: string; userId: string };
    try { verified = await this.withTimeout(signal => this.http.verify(body.baseUrl, body.accessToken, signal)); }
    catch (error) {
      const kind = error instanceof CanvasRequestError ? error.kind : 'unreachable';
      if (kind === 'unreachable') throw new ServiceUnavailableException(failures[kind]);
      throw new BadRequestException(failures[kind]);
    }
    const sealed = sealCanvasToken(key, user.id, body.accessToken);
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('canvas'), hashtext(${user.id}))::text`;
      const existing = await tx.canvasConnection.findUnique({ where: { userId: user.id } });
      const same = existing?.baseUrl === verified.origin && existing.externalAccountId === verified.userId;
      const identity = { baseUrl: verified.origin, externalAccountId: verified.userId, encryptedAccessToken: sealed, lastError: null };
      await tx.canvasConnection.upsert({ where: { userId: user.id }, create: { userId: user.id, ...identity },
        // A replacement token for the same Canvas account keeps its sync history.
        update: same ? identity : { ...identity, lastSuccessfulSyncAt: null, lastSyncAttemptAt: null } });
    }, { timeout: 30000, maxWait: 10000 });
    return this.status(user);
  }
  /** Forgets the stored token. Imported courses and coursework stay as saved records. */
  async disconnect(user: RequestUser) {
    await this.prisma.canvasConnection.deleteMany({ where: { userId: user.id } });
    return this.status(user);
  }
  async status(user: RequestUser) {
    const connection = await this.prisma.canvasConnection.findUnique({ where: { userId: user.id } });
    return canvasConnectionStatusSchema.parse({
      connected: Boolean(connection), connectMode: canvasConnectMode(), baseUrl: connection?.baseUrl ?? null, externalAccountId: connection?.externalAccountId ?? null,
      lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastSyncAttemptAt: connection?.lastSyncAttemptAt?.toISOString() ?? null, lastError: connection?.lastError ?? null,
    });
  }
  async sync(user: RequestUser) {
    if (canvasConnectMode() === 'token') return this.syncToken(user);
    this.assertFixtureEnabled();
    const result = await this.prisma.$transaction(async tx => {
      // The connection writer uses the same account lock; fetch only after locking.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('canvas'), hashtext(${user.id}))::text`;
      const startedAt = new Date();
      const connection = await tx.canvasConnection.findUnique({ where: { userId: user.id } });
      if (!connection) throw new BadRequestException('Canvas is not connected');
      if (connection.baseUrl !== fixtureBaseUrl || connection.externalAccountId !== `fixture-${user.id}`) throw oauthUnavailable();
      let batch: AcademicSnapshot;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Validate the entire complete batch before the first entity write.
        const loaded = await Promise.race([this.provider.fetchAcademicSnapshot(controller.signal), new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Canvas source timeout')); }, 5000);
        })]);
        batch = academicSnapshotSchema.parse(loaded);
      } catch {
        await tx.canvasConnection.update({ where: { userId: user.id },
          data: { lastSyncAttemptAt: startedAt, lastError: 'Canvas source unavailable or invalid' } });
        return null;
      } finally { if (timer) clearTimeout(timer); }
      return this.persist(tx, user.id, fixtureSource, batch, startedAt);
    }, { timeout: 30000, maxWait: 10000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (!result) throw new ServiceUnavailableException('Canvas source unavailable or invalid');
    return result;
  }
  /**
   * Live sync. Canvas is read before the transaction (it can take many seconds);
   * the write then rechecks under the account lock that the same token is still
   * stored, so a disconnect or reconnect during the fetch wins.
   */
  private async syncToken(user: RequestUser) {
    const connection = await this.prisma.canvasConnection.findUnique({ where: { userId: user.id } });
    if (!connection) throw new BadRequestException('Canvas is not connected');
    if (connection.baseUrl === fixtureBaseUrl) throw new ForbiddenException('Canvas fixtures require explicit development/test fixture mode');
    if (!isSealedCanvasToken(connection.encryptedAccessToken)) throw oauthUnavailable();
    const key = this.tokenKey(), startedAt = new Date();
    let token: string;
    try { token = openCanvasToken(key, user.id, connection.encryptedAccessToken); }
    catch { throw new ConflictException('The saved Canvas token can’t be read. Connect Canvas again.'); }
    let batch: AcademicSnapshot;
    try { batch = academicSnapshotSchema.parse(await this.withTimeout(signal => this.http.fetchAcademicSnapshot(connection.baseUrl, token, signal))); }
    catch (error) {
      const kind = error instanceof CanvasRequestError ? error.kind : 'invalid-response';
      await this.prisma.canvasConnection.updateMany({ where: { userId: user.id, encryptedAccessToken: connection.encryptedAccessToken },
        data: { lastSyncAttemptAt: startedAt, lastError: failures[kind] } });
      // 409, not 401: a rejected Canvas token must not end the CampusFlow session.
      if (kind === 'unauthorized') throw new ConflictException(failures[kind]);
      throw new ServiceUnavailableException(failures[kind]);
    }
    const result = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('canvas'), hashtext(${user.id}))::text`;
      const current = await tx.canvasConnection.findUnique({ where: { userId: user.id } });
      if (current?.encryptedAccessToken !== connection.encryptedAccessToken) return null;
      return this.persist(tx, user.id, canvasSource, batch, startedAt);
    }, { timeout: 30000, maxWait: 10000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (!result) throw new ConflictException('Canvas was disconnected or reconnected during the sync. Sync again.');
    return result;
  }
  /** Idempotent upserts keyed by (account, source, Canvas id). */
  private async persist(tx: Tx, userId: string, source: string, batch: AcademicSnapshot, startedAt: Date) {
    await this.reminders.lockAcademicReminders(userId, tx);
    for (const course of batch.courses) {
      const record = await tx.course.upsert({ where: { userId_source_externalId: { userId, source, externalId: course.externalId } },
        create: { userId, source, ...course }, update: course });
      for (const item of batch.academicItems.filter(item => item.courseExternalId === course.externalId)) {
        const { courseExternalId: _courseExternalId, ...fields } = item;
        const data = { ...fields, courseId: record.id, due: item.due ?? Prisma.JsonNull };
        await tx.academicItem.upsert({ where: { userId_source_externalId: { userId, source, externalId: item.externalId } },
          create: { userId, source, ...data }, update: data });
      }
      // Reconcile persisted intent, including retained items when a course is
      // explicitly inactivated/reactivated. Absence is never a deletion signal.
      const configured = await tx.academicItem.findMany({ where: { userId, courseId: record.id,
        reminderLeadMinutes: { not: null } }, select: { id: true }, orderBy: { id: 'asc' } });
      for (const item of configured) await this.reminders.reconcileAcademicItem(userId, item.id, tx);
    }
    const finishedAt = new Date();
    await tx.canvasConnection.update({ where: { userId },
      data: { lastSyncAttemptAt: startedAt, lastSuccessfulSyncAt: finishedAt, lastError: null } });
    return canvasSyncResultSchema.parse({ startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
      coursesUpdated: batch.courses.length, academicItemsUpdated: batch.academicItems.length, eventsUpdated: 0, status: 'succeeded' });
  }
}

@Controller('canvas') @UseGuards(AuthGuard)
export class CanvasController {
  constructor(private readonly canvas: CanvasService) {}
  @Get('status') status(@CurrentUser() user: RequestUser) { return this.canvas.status(user); }
  @Get('connect/start') connect(): never { throw oauthUnavailable(); }
  @Post('connect') connectToken(@CurrentUser() user: RequestUser, @Body(new ZodPipe(canvasTokenConnectSchema)) body: CanvasTokenConnect) {
    return this.canvas.connectToken(user, body);
  }
  @Delete('connection') @HttpCode(200) disconnect(@CurrentUser() user: RequestUser) { return this.canvas.disconnect(user); }
  @Post('dev/connect') connectFixture(@CurrentUser() user: RequestUser, @Body(new ZodPipe(emptyBody)) _body: z.infer<typeof emptyBody>) {
    return this.canvas.connectFixture(user);
  }
  @Post('sync') sync(@CurrentUser() user: RequestUser, @Body(new ZodPipe(emptyBody)) _body: z.infer<typeof emptyBody>) { return this.canvas.sync(user); }
}
