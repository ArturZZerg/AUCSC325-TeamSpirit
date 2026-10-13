CREATE TABLE "TaskCreationRequest" (
    "userId" UUID NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "taskId" UUID,
    CONSTRAINT "TaskCreationRequest_pkey" PRIMARY KEY ("userId", "requestKey")
);
CREATE UNIQUE INDEX "TaskCreationRequest_taskId_key" ON "TaskCreationRequest"("taskId");
ALTER TABLE "TaskCreationRequest" ADD CONSTRAINT "TaskCreationRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCreationRequest" ADD CONSTRAINT "TaskCreationRequest_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "PersonalTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
