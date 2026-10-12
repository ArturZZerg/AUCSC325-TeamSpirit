ALTER TABLE "WellnessEntry" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WellnessEntry" ADD CONSTRAINT "WellnessEntry_revision_positive" CHECK ("revision" > 0);
