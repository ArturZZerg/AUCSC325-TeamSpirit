CREATE TABLE "StudyPlan" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "academicItemId" UUID,
  "title" TEXT NOT NULL,
  "deadlineWhenPlanned" JSONB,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudyPlan_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PersonalTask" ADD COLUMN "studyPlanId" UUID, ADD COLUMN "studyPlanOrder" INTEGER;
CREATE UNIQUE INDEX "StudyPlan_userId_requestKey_key" ON "StudyPlan"("userId", "requestKey");
CREATE INDEX "StudyPlan_userId_createdAt_idx" ON "StudyPlan"("userId", "createdAt");
CREATE INDEX "PersonalTask_studyPlanId_studyPlanOrder_idx" ON "PersonalTask"("studyPlanId", "studyPlanOrder");
ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_academicItemId_fkey" FOREIGN KEY ("academicItemId") REFERENCES "AcademicItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PersonalTask" ADD CONSTRAINT "PersonalTask_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "StudyPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
