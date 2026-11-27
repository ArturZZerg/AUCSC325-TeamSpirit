ALTER TABLE "TaskCreationRequest" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "TaskCreationRequest_createdAt_idx" ON "TaskCreationRequest"("createdAt");
