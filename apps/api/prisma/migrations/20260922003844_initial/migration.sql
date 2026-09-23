-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalTask" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT NOT NULL DEFAULT 'personal',
    "due" JSONB,
    "scheduled" JSONB,
    "recurrence" JSONB,
    "estimatedMinutes" INTEGER,
    "completedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "mainGoalDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCompletion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "due" JSONB,
    "submissionState" TEXT,
    "mainGoalDate" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'health',
    "schedule" JSONB NOT NULL,
    "timeZone" TEXT NOT NULL,
    "reminder" JSONB,
    "pausedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalCompletion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "sourceScope" TEXT NOT NULL DEFAULT 'public',
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "timing" JSONB NOT NULL,
    "location" TEXT,
    "url" TEXT,
    "sortAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedEvent" (
    "userId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "includedInPlan" BOOLEAN NOT NULL DEFAULT false,
    "reminder" JSONB,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedEvent_pkey" PRIMARY KEY ("userId","eventId")
);

-- CreateTable
CREATE TABLE "WellnessEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "mood" INTEGER,
    "energy" INTEGER,
    "stress" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellnessEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "academicEnabled" BOOLEAN NOT NULL DEFAULT true,
    "personalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "goalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eventEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyOverviewEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "occurrenceKey" TEXT,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "personalTaskId" UUID,
    "academicItemId" UUID,
    "goalId" UUID,
    "savedEventUserId" UUID,
    "savedEventEventId" UUID,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasConnection" (
    "userId" UUID NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "oauthStateHash" TEXT,
    "oauthStateExpiresAt" TIMESTAMP(3),
    "lastSyncAttemptAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "syncLeaseUntil" TIMESTAMP(3),
    "coveredFrom" TEXT,
    "coveredThrough" TEXT,

    CONSTRAINT "CanvasConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "PersonalTask_userId_updatedAt_idx" ON "PersonalTask"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "PersonalTask_userId_mainGoalDate_idx" ON "PersonalTask"("userId", "mainGoalDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCompletion_userId_taskId_occurrenceKey_key" ON "TaskCompletion"("userId", "taskId", "occurrenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Course_userId_source_externalId_key" ON "Course"("userId", "source", "externalId");

-- CreateIndex
CREATE INDEX "AcademicItem_userId_updatedAt_idx" ON "AcademicItem"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicItem_userId_source_externalId_key" ON "AcademicItem"("userId", "source", "externalId");

-- CreateIndex
CREATE INDEX "Goal_userId_updatedAt_idx" ON "Goal"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoalCompletion_userId_goalId_occurrenceKey_key" ON "GoalCompletion"("userId", "goalId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "Event_sortAt_idx" ON "Event"("sortAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_source_sourceScope_externalId_key" ON "Event"("source", "sourceScope", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WellnessEntry_userId_date_key" ON "WellnessEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "Reminder_userId_fireAt_idx" ON "Reminder"("userId", "fireAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_userId_targetKind_targetId_occurrenceKey_key" ON "Reminder"("userId", "targetKind", "targetId", "occurrenceKey");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTask" ADD CONSTRAINT "PersonalTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PersonalTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicItem" ADD CONSTRAINT "AcademicItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicItem" ADD CONSTRAINT "AcademicItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalCompletion" ADD CONSTRAINT "GoalCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalCompletion" ADD CONSTRAINT "GoalCompletion_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedEvent" ADD CONSTRAINT "SavedEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedEvent" ADD CONSTRAINT "SavedEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessEntry" ADD CONSTRAINT "WellnessEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_personalTaskId_fkey" FOREIGN KEY ("personalTaskId") REFERENCES "PersonalTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_academicItemId_fkey" FOREIGN KEY ("academicItemId") REFERENCES "AcademicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_savedEventUserId_savedEventEventId_fkey" FOREIGN KEY ("savedEventUserId", "savedEventEventId") REFERENCES "SavedEvent"("userId", "eventId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasConnection" ADD CONSTRAINT "CanvasConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
