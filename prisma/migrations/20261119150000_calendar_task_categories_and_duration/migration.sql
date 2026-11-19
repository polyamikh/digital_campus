CREATE TYPE "PersonalTaskCategory" AS ENUM ('STUDY', 'WORK', 'PERSONAL');

ALTER TABLE "PersonalTask"
ADD COLUMN "endsAt" TIMESTAMPTZ(6),
ADD COLUMN "category" "PersonalTaskCategory" NOT NULL DEFAULT 'PERSONAL';

ALTER TABLE "PersonalTask"
ADD CONSTRAINT "PersonalTask_endsAt_after_dueAt_check"
CHECK ("endsAt" IS NULL OR ("dueAt" IS NOT NULL AND "endsAt" > "dueAt"));
