ALTER TABLE "AcademicItem" ADD COLUMN "reminderLeadMinutes" INTEGER;
ALTER TABLE "AcademicItem" ADD CONSTRAINT "AcademicItem_reminderLeadMinutes_check"
  CHECK ("reminderLeadMinutes" >= 0);
