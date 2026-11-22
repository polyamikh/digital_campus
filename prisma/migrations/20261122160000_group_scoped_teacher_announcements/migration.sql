-- Add optional group targeting for teacher course announcements.
-- Existing course-wide announcement rows remain unchanged with groupId = NULL.
ALTER TABLE "CourseAnnouncement"
  ADD COLUMN "groupId" UUID;

ALTER TABLE "CourseAnnouncement"
  ADD CONSTRAINT "CourseAnnouncement_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CourseAnnouncement_groupId_publishedAt_idx"
  ON "CourseAnnouncement"("groupId", "publishedAt");
