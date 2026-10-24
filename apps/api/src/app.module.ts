import { EventSyncService } from './integrations/events/event-sync.service';
import { AccountController, AccountService } from './account';
import { HealthController, HealthService } from './health';
import { CAMPUS_FEEDS, configuredCampusFeeds } from './integrations/events/campus-feeds';
import { CampusFeedsService, CampusSourcesController } from './integrations/events/campus-feeds.service';
import { ClassesController } from './classes';
import { StudyPlansController } from './study-plans';
import { FocusController } from './focus';
import { GymController } from './gym';
import { Module } from '@nestjs/common';
import { AuthController, AuthService, MeController } from './auth';
import { AcademicController, EventsController, GoalsController, PreferencesController, ReminderService, TasksController } from './data';
import { WellnessController } from './wellness';
import { PrismaService } from './prisma.service';
import { TodayController, TodayService } from './today';
import { CanvasController, CanvasService } from './canvas';
import { CanvasProvider, FixtureCanvasProvider } from './integrations/canvas/canvas-provider';
import { CanvasHttpClient } from './integrations/canvas/canvas-http';
import { CanvasSyncWorker } from './integrations/canvas/canvas-sync-worker';
import { RECOVERY_CONFIG, recoveryConfig } from './auth-recovery/recovery-config';
import { RecoveryController, RecoveryService } from './auth-recovery/recovery-service';
import { RecoveryRateService } from './auth-recovery/recovery-rate';
import { RECOVERY_MAILER, SmtpRecoveryMailer } from './auth-recovery/recovery-mail';
import { RecoveryWorker } from './auth-recovery/recovery-worker';
import { REGISTRATION_CONFIG, registrationConfig } from './auth-config';
import type { RecoveryConfig } from './auth-recovery/recovery-config';
import { EmailVerificationController, EmailVerificationService } from './email-verification';
import { AUTH_RATE_CONFIG, AuthRateService, authRateConfig } from './auth-rate';

@Module({
  controllers: [HealthController, AccountController, AuthController, RecoveryController, EmailVerificationController, MeController, TasksController, AcademicController, GoalsController, WellnessController, EventsController, PreferencesController, TodayController, CanvasController, ClassesController, StudyPlansController, FocusController, GymController, CampusSourcesController],
  providers: [HealthService, AccountService, EventSyncService, CampusFeedsService, { provide: CAMPUS_FEEDS, useFactory: configuredCampusFeeds }, PrismaService, AuthService, ReminderService, TodayService, CanvasService,
    { provide: CanvasProvider, useClass: FixtureCanvasProvider }, CanvasHttpClient, CanvasSyncWorker,
    { provide: RECOVERY_CONFIG, useFactory: recoveryConfig }, RecoveryRateService, RecoveryService, RecoveryWorker,
    { provide: AUTH_RATE_CONFIG, useFactory: authRateConfig }, AuthRateService,
    { provide: REGISTRATION_CONFIG, useFactory: (mail: RecoveryConfig) => registrationConfig(mail), inject: [RECOVERY_CONFIG] }, EmailVerificationService,
    { provide: RECOVERY_MAILER, useClass: SmtpRecoveryMailer }],
})
export class AppModule {}
