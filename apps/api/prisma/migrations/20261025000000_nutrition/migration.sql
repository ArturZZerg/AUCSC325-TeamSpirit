CREATE TABLE "NutritionProfile" (
    "userId" UUID NOT NULL,
    "sex" TEXT,
    "birthYear" INTEGER NOT NULL,
    "heightCm" DOUBLE PRECISION NOT NULL,
    "activity" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "overrides" JSONB,
    "diningHall" TEXT NOT NULL DEFAULT 'auto',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NutritionProfile_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "NutritionProfile_values_check" CHECK ("diningHall" IN ('auto', 'on', 'off') AND ("sex" IS NULL OR "sex" IN ('female', 'male')))
);
CREATE TABLE "UserFood" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "per100" JSONB NOT NULL,
    "portions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFood_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FoodLogEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "meal" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "fiber" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodLogEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FoodLogEntry_values_check" CHECK ("meal" IN ('breakfast', 'lunch', 'dinner', 'snack') AND "grams" > 0
      AND "kcal" >= 0 AND "protein" >= 0 AND "fat" >= 0 AND "carbs" >= 0 AND "fiber" >= 0)
);
CREATE TABLE "DiningMenuDay" (
    "date" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL,
    "meals" JSONB NOT NULL,
    "error" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiningMenuDay_pkey" PRIMARY KEY ("date")
);
CREATE INDEX "UserFood_userId_idx" ON "UserFood"("userId");
CREATE UNIQUE INDEX "FoodLogEntry_userId_requestKey_key" ON "FoodLogEntry"("userId", "requestKey");
CREATE INDEX "FoodLogEntry_userId_date_idx" ON "FoodLogEntry"("userId", "date");
ALTER TABLE "NutritionProfile" ADD CONSTRAINT "NutritionProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFood" ADD CONSTRAINT "UserFood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodLogEntry" ADD CONSTRAINT "FoodLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
