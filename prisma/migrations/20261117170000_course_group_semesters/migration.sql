ALTER TABLE "CourseGroup"
  ADD COLUMN "academicYear" VARCHAR(9),
  ADD COLUMN "semesterNumber" INTEGER;

ALTER TABLE "CourseGroup"
  ADD CONSTRAINT "CourseGroup_semesterNumber_range_check"
  CHECK ("semesterNumber" IS NULL OR "semesterNumber" BETWEEN 1 AND 4);
