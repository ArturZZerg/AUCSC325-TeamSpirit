CREATE TABLE "ClassSchedule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "weekdays" INTEGER[] NOT NULL,
    "termStart" TEXT NOT NULL,
    "termEnd" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "location" TEXT,
    "instructor" TEXT,
    "notes" TEXT,
    "color" TEXT NOT NULL DEFAULT 'moss',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClassSchedule_userId_termStart_idx" ON "ClassSchedule"("userId", "termStart");
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
