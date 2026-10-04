import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { canvasConnectionStatusSchema, canvasSyncResultSchema } from '@campusflow/contracts';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe } from './common';
import { ReminderService } from './data';
import { PrismaService } from './prisma.service';
import { academicSnapshotSchema, CanvasProvider } from './integrations/canvas/canvas-provider';

export const fixtureBaseUrl = 'https://canvas.fixture.local';
// Fixtures cannot overwrite records from an institutional connection.
export const fixtureSource = 'canvas:fixture';
const emptyBody = z.object({}).strict().default({});
const oauthUnavailable = () => new ServiceUnavailableException('Canvas OAuth is disabled until this deployment has an institution-approved developer key and HTTPS callback.');

@Injectable()
export class CanvasService {
  constructor(private readonly prisma: PrismaService, private readonly provider: CanvasProvider, private readonly reminders: ReminderService) {}
  private assertFixtureEnabled(): void {
    if (!['development', 'test'].includes(process.env.NODE_ENV ?? '') || process.env.CANVAS_MODE !== 'fixture')
      throw new ForbiddenException('Canvas fixtures require explicit development/test fixture mode');
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
  async status(user: RequestUser) {
    const connection = await this.prisma.canvasConnection.findUnique({ where: { userId: user.id } });
    return canvasConnectionStatusSchema.parse({
      connected: Boolean(connection), baseUrl: connection?.baseUrl ?? null, externalAccountId: connection?.externalAccountId ?? null,
      lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastSyncAttemptAt: connection?.lastSyncAttemptAt?.toISOString() ?? null, lastError: connection?.lastError ?? null,
    });
  }
  async sync(user: RequestUser) {
    this.assertFixtureEnabled();
    const result = await this.prisma.$transaction(async tx => {
      // The connection writer uses the same account lock; fetch only after locking.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('canvas'), hashtext(${user.id}))::text`;
      const startedAt = new Date();
      const connection = await tx.canvasConnection.findUnique({ where: { userId: user.id } });
      if (!connection) throw new BadRequestException('Canvas is not connected');
      if (connection.baseUrl !== fixtureBaseUrl || connection.externalAccountId !== `fixture-${user.id}`) throw oauthUnavailable();
      let batch: z.infer<typeof academicSnapshotSchema>;
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
      await this.reminders.lockAcademicReminders(user.id, tx);
      for (const course of batch.courses) {
        const record = await tx.course.upsert({ where: { userId_source_externalId: { userId: user.id, source: fixtureSource, externalId: course.externalId } },
          create: { userId: user.id, source: fixtureSource, ...course }, update: course });
        for (const item of batch.academicItems.filter(item => item.courseExternalId === course.externalId)) {
          const { courseExternalId: _courseExternalId, ...fields } = item;
          const data = { ...fields, courseId: record.id, due: item.due ?? Prisma.JsonNull };
          await tx.academicItem.upsert({ where: { userId_source_externalId: { userId: user.id, source: fixtureSource, externalId: item.externalId } },
            create: { userId: user.id, source: fixtureSource, ...data }, update: data });
        }
        // Reconcile persisted intent, including retained items when a course is
        // explicitly inactivated/reactivated. Absence is never a deletion signal.
        const configured = await tx.academicItem.findMany({ where: { userId: user.id, courseId: record.id,
          reminderLeadMinutes: { not: null } }, select: { id: true }, orderBy: { id: 'asc' } });
        for (const item of configured) await this.reminders.reconcileAcademicItem(user.id, item.id, tx);
      }
      const finishedAt = new Date();
      await tx.canvasConnection.update({ where: { userId: user.id },
        data: { lastSyncAttemptAt: startedAt, lastSuccessfulSyncAt: finishedAt, lastError: null } });
      return canvasSyncResultSchema.parse({ startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
        coursesUpdated: batch.courses.length, academicItemsUpdated: batch.academicItems.length, eventsUpdated: 0, status: 'succeeded' });
    }, { timeout: 30000, maxWait: 10000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (!result) throw new ServiceUnavailableException('Canvas source unavailable or invalid');
    return result;
  }
}

@Controller('canvas') @UseGuards(AuthGuard)
export class CanvasController {
  constructor(private readonly canvas: CanvasService) {}
  @Get('status') status(@CurrentUser() user: RequestUser) { return this.canvas.status(user); }
  @Get('connect/start') connect(): never { throw oauthUnavailable(); }
  @Post('connect') connectLocal(): never { throw oauthUnavailable(); }
  @Post('dev/connect') connectFixture(@CurrentUser() user: RequestUser, @Body(new ZodPipe(emptyBody)) _body: z.infer<typeof emptyBody>) {
    return this.canvas.connectFixture(user);
  }
  @Post('sync') sync(@CurrentUser() user: RequestUser, @Body(new ZodPipe(emptyBody)) _body: z.infer<typeof emptyBody>) { return this.canvas.sync(user); }
}
