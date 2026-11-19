CREATE TYPE "PersonalTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

ALTER TABLE "PersonalTask"
ADD COLUMN "hasDueTime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "priority" "PersonalTaskPriority" NOT NULL DEFAULT 'MEDIUM';

-- Existing dated tasks already contain a concrete timestamp; preserve that display semantics.
UPDATE "PersonalTask"
SET "hasDueTime" = true
WHERE "dueAt" IS NOT NULL;
