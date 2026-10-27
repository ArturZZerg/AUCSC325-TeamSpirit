-- Assessment groups for course grades, including groups imported from Canvas (ADR 024).
ALTER TABLE "Course" ADD COLUMN "assessmentGroups" JSONB NOT NULL DEFAULT '[]';
