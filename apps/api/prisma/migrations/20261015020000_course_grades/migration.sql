-- Student-entered weighted assessments and an optional target grade per course.
ALTER TABLE "Course" ADD COLUMN "assessments" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Course" ADD COLUMN "targetGrade" INTEGER;
