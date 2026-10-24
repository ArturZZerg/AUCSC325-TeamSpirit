import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addCalendarDays, localDateAt } from '@campusflow/domain';
import { PrismaService } from '../../prisma.service';
import { fetchWagnerDay, parseDay } from './wagner';

export const diningZone = 'America/Edmonton';
// The menu is published a few days ahead. Today is re-read every two hours (dishes
// change before meals); later days twice a day. Requests are three seconds apart.
export const diningPolicy = { tickMs: 15 * 60_000, todayMs: 2 * 3600_000, aheadMs: 12 * 3600_000, unpublishedMs: 6 * 3600_000, daysAhead: 4, gapMs: 3000 };
export const diningEnabled = (env: NodeJS.ProcessEnv = process.env) => env.DINING_SYNC === 'on' || (env.NODE_ENV === 'production' && env.DINING_SYNC !== 'off');

@Injectable()
export class DiningSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DiningSyncService.name);
  private timer?: ReturnType<typeof setTimeout>; private stopping = false; private running?: Promise<number>;
  constructor(private readonly prisma: PrismaService) {}
  onApplicationBootstrap() { if (diningEnabled() && process.env.NODE_ENV !== 'test') this.schedule(5000); }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearTimeout(this.timer); await this.running?.catch(() => undefined); }
  private schedule(delay = diningPolicy.tickMs) {
    if (this.stopping) return;
    this.timer = setTimeout(() => { void this.runOnce().catch(() => this.logger.warn('Dining menu refresh failed.')).finally(() => this.schedule()); }, delay);
    this.timer.unref();
  }

  /** Refreshes stale days from today; returns how many pages were read. */
  runOnce(now = new Date(), fetcher: typeof fetch = fetch): Promise<number> {
    if (!this.running) this.running = this.process(now, fetcher).finally(() => { this.running = undefined; });
    return this.running;
  }
  private async process(now: Date, fetcher: typeof fetch) {
    const today = localDateAt(now.toISOString(), diningZone);
    let read = 0;
    for (let offset = 0; offset < diningPolicy.daysAhead && !this.stopping; offset++) {
      const date = addCalendarDays(today, offset);
      const stored = await this.prisma.diningMenuDay.findUnique({ where: { date } });
      const age = stored ? now.getTime() - stored.fetchedAt.getTime() : Infinity;
      const limit = !stored?.published ? diningPolicy.unpublishedMs : offset === 0 ? diningPolicy.todayMs : diningPolicy.aheadMs;
      if (age < limit) { if (!stored?.published && offset > 0) break; continue; }
      if (read) await new Promise(resolve => setTimeout(resolve, diningPolicy.gapMs));
      read++;
      const published = await this.refresh(date, now, fetcher);
      // Later days are not published either once one is missing.
      if (!published && offset > 0) break;
    }
    return read;
  }
  /** One day. A failed or empty read never replaces a published menu; the error is kept for the app to show. */
  async refresh(date: string, now = new Date(), fetcher: typeof fetch = fetch): Promise<boolean> {
    const stored = await this.prisma.diningMenuDay.findUnique({ where: { date } });
    let parsed;
    try { parsed = parseDay(await fetchWagnerDay(date, fetcher), date); }
    catch (error) { parsed = { ok: false as const, error: error instanceof Error ? error.message : 'menu site unavailable' }; }
    if (!parsed.ok) {
      this.logger.warn(`Dining menu ${date}: ${parsed.error}`);
      if (stored) await this.prisma.diningMenuDay.update({ where: { date }, data: { error: parsed.error.slice(0, 200) } });
      else await this.prisma.diningMenuDay.create({ data: { date, published: false, meals: [], error: parsed.error.slice(0, 200), fetchedAt: now } });
      return false;
    }
    if (stored?.published && !parsed.published) { await this.prisma.diningMenuDay.update({ where: { date }, data: { fetchedAt: now, error: null } }); return true; }
    const data = { published: parsed.published, meals: parsed.meals as unknown as Prisma.InputJsonValue, error: null, fetchedAt: now };
    await this.prisma.diningMenuDay.upsert({ where: { date }, create: { date, ...data }, update: data });
    return parsed.published;
  }
}
