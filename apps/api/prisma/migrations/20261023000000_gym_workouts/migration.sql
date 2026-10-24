CREATE TABLE "GymEnrollment" (
    "userId" UUID NOT NULL,
    "programId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "weeklyTarget" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GymEnrollment_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "GymEnrollment_values_check" CHECK ("unit" IN ('kg', 'lb') AND "weeklyTarget" BETWEEN 1 AND 7)
);
CREATE TABLE "Workout" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "programId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "unit" TEXT NOT NULL,
    "exercises" JSONB NOT NULL,
    "note" TEXT,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Workout_values_check" CHECK (
      "unit" IN ('kg', 'lb') AND "endedAt" >= "startedAt" AND "endedAt" <= "startedAt" + INTERVAL '5 hours'
      AND jsonb_typeof("exercises") = 'array'
    )
);
CREATE UNIQUE INDEX "Workout_userId_requestKey_key" ON "Workout"("userId", "requestKey");
CREATE INDEX "Workout_userId_endedAt_idx" ON "Workout"("userId", "endedAt");
ALTER TABLE "GymEnrollment" ADD CONSTRAINT "GymEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
