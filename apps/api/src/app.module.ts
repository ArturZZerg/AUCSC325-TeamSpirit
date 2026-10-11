import { EventSyncService } from './integrations/events/event-sync.service';
import { CAMPUS_FEEDS, configuredCampusFeeds } from './integrations/events/campus-feeds';
import { CampusFeedsService, CampusSourcesController } from './integrations/events/campus-feeds.service';
import { ClassesController } from './classes';
import { StudyPlansController } from './study-plans';
import { FocusController } from './focus';
import { Module } from '@nestjs/common';
import { AuthController, AuthService, MeController } from './auth';
import { AcademicController, EventsController, GoalsController, PreferencesController, ReminderService, TasksController, WellnessController } from './data';
import { PrismaService } from './prisma.service';
import { TodayController, TodayService } from './today';
import { CanvasController, CanvasService } from './canvas';
import { CanvasProvider, FixtureCanvasProvider } from './integrations/canvas/canvas-provider';

@Module({
  controllers: [AuthController, MeController, TasksController, AcademicController, GoalsController, WellnessController, EventsController, PreferencesController, TodayController, CanvasController, ClassesController, StudyPlansController, FocusController, CampusSourcesController],
  providers: [EventSyncService, CampusFeedsService, { provide: CAMPUS_FEEDS, useFactory: configuredCampusFeeds }, PrismaService, AuthService, ReminderService, TodayService, CanvasService,
    { provide: CanvasProvider, useClass: FixtureCanvasProvider }],
})
export class AppModule {}
