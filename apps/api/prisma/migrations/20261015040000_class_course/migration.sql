-- A timetable class may belong to one of the student's courses.
ALTER TABLE "ClassSchedule" ADD COLUMN "courseId" UUID;
CREATE INDEX "ClassSchedule_courseId_idx" ON "ClassSchedule"("courseId");
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
