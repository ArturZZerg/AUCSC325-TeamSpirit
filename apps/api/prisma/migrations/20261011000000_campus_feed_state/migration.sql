CREATE TABLE "CampusFeedState" (
  "source" TEXT NOT NULL,
  "lastAttemptAt" TIMESTAMP(3) NOT NULL,
  "lastSuccessfulAt" TIMESTAMP(3),
  "lastStatus" TEXT NOT NULL,
  "coveredFrom" TEXT,
  "coveredThrough" TEXT,
  "timeZone" TEXT,
  CONSTRAINT "CampusFeedState_pkey" PRIMARY KEY ("source")
);
