import { Controller, Get, Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, UseGuards } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { campusSourcesSchema } from '@campusflow/contracts';
import { localDateAt } from '@campusflow/domain';
import { AuthGuard } from '../../common';
import { PrismaService } from '../../prisma.service';
import { EventSyncService } from './event-sync.service';
import { CAMPUS_FEEDS, CampusFeed } from './campus-feeds';

@Injectable()
export class CampusFeedsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private running?: Promise<void>;
  private readonly logger = new Logger(CampusFeedsService.name);
  constructor(private readonly prisma: PrismaService, private readonly sync: EventSyncService,
    @Inject(CAMPUS_FEEDS) private readonly feeds: CampusFeed[]) {}

  onApplicationBootstrap() {
    if (!this.feeds.length) return;
    const tick = async () => {
      if (this.stopped) return;
      this.running = this.refresh();
      await this.running;
      if (!this.stopped) { this.timer = setTimeout(() => { void tick(); }, 60000); this.timer.unref(); }
    };
    void tick();
  }
  async onModuleDestroy() { this.stopped = true; clearTimeout(this.timer); await this.running; }

  /** Serialized DB state prevents multiple API replicas repeatedly fetching a feed. */
  async refresh(now = new Date()) {
    for (const feed of this.feeds) {
      if (this.stopped) return;
      const today = Temporal.PlainDate.from(localDateAt(now.toISOString(), feed.timeZone));
      try {
        const result = await this.sync.sync({ source: feed.source, sourceScope: 'public' }, feed.provider,
          { from: today.subtract({ days: 1 }).toString(), through: today.add({ days: 61 }).toString(), timeZone: feed.timeZone },
          { now, successIntervalMs: 60 * 60000, failureIntervalMs: 15 * 60000 });
        if (result.status === 'failed' || result.status === 'incomplete') this.logger.warn(`Campus calendar refresh ${result.status}: ${feed.source}`);
      } catch { this.logger.warn(`Campus calendar refresh could not persist: ${feed.source}`); }
    }
  }
  async status(now = new Date()) {
    const rows = this.feeds.length ? await this.prisma.campusFeedState.findMany({ where: { source: { in: this.feeds.map(feed => feed.source) } } }) : [];
    return campusSourcesSchema.parse({ generatedAt: now.toISOString(), sources: this.feeds.map(feed => {
      const state = rows.find(row => row.source === feed.source);
      const coverage = state?.coveredFrom && state.coveredThrough && state.timeZone
        ? { from: state.coveredFrom, through: state.coveredThrough, timeZone: state.timeZone } : null;
      const successful = state?.lastSuccessfulAt ?? null;
      const date = localDateAt(now.toISOString(), feed.timeZone);
      const current = successful && coverage && state?.lastStatus === 'complete'
        && now.getTime() >= successful.getTime() && now.getTime() - successful.getTime() < 90 * 60000
        && coverage.from <= date && date < coverage.through;
      return { source: feed.source, name: feed.name, website: feed.website,
        lastSuccessfulAt: successful?.toISOString() ?? null, coverage,
        availability: current ? 'available' : successful ? 'stale' : 'unavailable' };
    }) });
  }
}

@Controller('events/sources') @UseGuards(AuthGuard)
export class CampusSourcesController {
  constructor(private readonly feeds: CampusFeedsService) {}
  @Get() status() { return this.feeds.status(); }
}
