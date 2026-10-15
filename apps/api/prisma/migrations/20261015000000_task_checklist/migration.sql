-- Ordered steps for one-time personal tasks; edited only through item endpoints.
ALTER TABLE "PersonalTask" ADD COLUMN "checklist" JSONB NOT NULL DEFAULT '[]';
