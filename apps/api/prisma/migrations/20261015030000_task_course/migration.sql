-- A personal task may belong to one of the student's courses.
ALTER TABLE "PersonalTask" ADD COLUMN "courseId" UUID;
CREATE INDEX "PersonalTask_courseId_idx" ON "PersonalTask"("courseId");
ALTER TABLE "PersonalTask" ADD CONSTRAINT "PersonalTask_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
