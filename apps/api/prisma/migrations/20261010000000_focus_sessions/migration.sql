CREATE TABLE "FocusSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID,
    "title" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "focusedSeconds" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FocusSession_time_check" CHECK (
      "plannedMinutes" BETWEEN 1 AND 90 AND "focusedSeconds" BETWEEN 1 AND "plannedMinutes" * 60
      AND "endedAt" >= "startedAt" + "focusedSeconds" * INTERVAL '1 second'
      AND "outcome" IN ('completed', 'interrupted')
      AND ("outcome" <> 'completed' OR "focusedSeconds" = "plannedMinutes" * 60)
    )
);
CREATE UNIQUE INDEX "FocusSession_userId_requestKey_key" ON "FocusSession"("userId", "requestKey");
CREATE INDEX "FocusSession_userId_endedAt_idx" ON "FocusSession"("userId", "endedAt");
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PersonalTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
