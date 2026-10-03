import { Module } from "@nestjs/common";
import { AuthController, AuthService, MeController } from "./auth";
import {
  AcademicController,
  EventsController,
  GoalsController,
  PreferencesController,
  ReminderService,
  TasksController,
  WellnessController,
} from "./data";
import { PrismaService } from "./prisma.service";
import { CanvasController, CanvasService } from "./canvas";
import { TodayController, TodayService } from "./today";

@Module({
  controllers: [
    AuthController,
    MeController,
    TasksController,
    AcademicController,
    GoalsController,
    WellnessController,
    EventsController,
    PreferencesController,
    TodayController,
    CanvasController,
  ],
  providers: [
    PrismaService,
    AuthService,
    ReminderService,
    TodayService,
    CanvasService,
  ],
})
export class AppModule {}
