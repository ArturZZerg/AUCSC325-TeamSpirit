import { EventSyncService } from './integrations/events/event-sync.service';
import { ClassesController } from './classes';
import { Module } from '@nestjs/common';
import { AuthController, AuthService, MeController } from './auth';
import { AcademicController, EventsController, GoalsController, PreferencesController, ReminderService, TasksController, WellnessController } from './data';
import { PrismaService } from './prisma.service';
import { TodayController, TodayService } from './today';
import { CanvasController, CanvasService } from './canvas';
import { CanvasProvider, FixtureCanvasProvider } from './integrations/canvas/canvas-provider';

@Module({
  controllers: [AuthController, MeController, TasksController, AcademicController, GoalsController, WellnessController, EventsController, PreferencesController, TodayController, CanvasController, ClassesController],
  providers: [EventSyncService, PrismaService, AuthService, ReminderService, TodayService, CanvasService,
    { provide: CanvasProvider, useClass: FixtureCanvasProvider }],
})
export class AppModule {}
