ALTER TABLE "GymEnrollment" ADD COLUMN "trackRir" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "UserExercise" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "load" TEXT NOT NULL,
    "muscles" TEXT[] NOT NULL,
    "note" TEXT,
    "mediaId" TEXT,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserExercise_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserExercise_values_check" CHECK ("load" IN ('external', 'added', 'bodyweight') AND length("name") BETWEEN 1 AND 80)
);
CREATE TABLE "UserProgram" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "days" JSONB NOT NULL,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserProgram_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserProgram_days_check" CHECK (jsonb_typeof("days") = 'array')
);
CREATE TABLE "BodyWeightEntry" (
    "userId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BodyWeightEntry_pkey" PRIMARY KEY ("userId", "date"),
    CONSTRAINT "BodyWeightEntry_values_check" CHECK ("unit" IN ('kg', 'lb') AND "weight" BETWEEN 20 AND 1000)
);
CREATE UNIQUE INDEX "UserExercise_userId_sourceKey_key" ON "UserExercise"("userId", "sourceKey");
CREATE INDEX "UserExercise_userId_idx" ON "UserExercise"("userId");
CREATE UNIQUE INDEX "UserProgram_userId_sourceKey_key" ON "UserProgram"("userId", "sourceKey");
CREATE INDEX "UserProgram_userId_idx" ON "UserProgram"("userId");
ALTER TABLE "UserExercise" ADD CONSTRAINT "UserExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProgram" ADD CONSTRAINT "UserProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BodyWeightEntry" ADD CONSTRAINT "BodyWeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
