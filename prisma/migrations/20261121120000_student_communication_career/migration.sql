-- Additive support for student chat workflows, career tools and pass decisions.
-- Existing records are retained; added classification fields remain nullable or
-- use compatibility defaults so old rows continue to work.

CREATE TYPE "AIConversationMode" AS ENUM ('STUDY_PLANNER', 'CAREER_ASSISTANT');
CREATE TYPE "ChatKind" AS ENUM ('COURSE', 'GROUP', 'DIRECT');
CREATE TYPE "CareerOpportunityKind" AS ENUM ('INTERNSHIP', 'JOB', 'PROJECT');
CREATE TYPE "CareerApplicationState" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "CareerEntryKind" AS ENUM ('EXPERIENCE', 'PROJECT');
CREATE TYPE "CareerEventState" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');
CREATE TYPE "CareerRegistrationState" AS ENUM ('ACTIVE', 'CANCELLED');

ALTER TABLE "Chat" ALTER COLUMN "courseId" DROP NOT NULL;
ALTER TABLE "Chat"
  ADD COLUMN "kind" "ChatKind" NOT NULL DEFAULT 'COURSE',
  ADD COLUMN "directKey" VARCHAR(80),
  ADD COLUMN "groupId" UUID;
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_course_kind_check"
  CHECK (("kind" = 'COURSE' AND "courseId" IS NOT NULL AND "groupId" IS NULL AND "directKey" IS NULL)
      OR ("kind" = 'GROUP' AND "courseId" IS NULL AND "groupId" IS NOT NULL AND "directKey" IS NULL)
      OR ("kind" = 'DIRECT' AND "courseId" IS NULL AND "groupId" IS NULL AND "directKey" IS NOT NULL));

ALTER TABLE "ChatMember"
  ADD COLUMN "lastReadAt" TIMESTAMPTZ(6),
  ADD COLUMN "mutedAt" TIMESTAMPTZ(6);

ALTER TABLE "Message"
  ADD COLUMN "replyToId" UUID,
  ADD COLUMN "pinnedAt" TIMESTAMPTZ(6),
  ADD COLUMN "pinnedById" UUID;
ALTER TABLE "Message" ADD CONSTRAINT "Message_pin_pair_check"
  CHECK (("pinnedAt" IS NULL) = ("pinnedById" IS NULL));

ALTER TABLE "AIConversation" ADD COLUMN "mode" "AIConversationMode";
ALTER TABLE "CareerOpportunity"
  ADD COLUMN "kind" "CareerOpportunityKind",
  ADD COLUMN "direction" VARCHAR(160),
  ADD COLUMN "externalUrl" VARCHAR(2000);
ALTER TABLE "PassRequest"
  ADD COLUMN "processedById" UUID,
  ADD COLUMN "decisionReason" TEXT;

CREATE UNIQUE INDEX "Chat_directKey_key" ON "Chat"("directKey");
CREATE INDEX "Chat_courseId_kind_idx" ON "Chat"("courseId", "kind");
CREATE INDEX "Chat_groupId_kind_idx" ON "Chat"("groupId", "kind");
CREATE UNIQUE INDEX "Message_id_chatId_key" ON "Message"("id", "chatId");
CREATE INDEX "Message_replyToId_chatId_idx" ON "Message"("replyToId", "chatId");
CREATE TABLE "MessageReaction" (
  "messageId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "reaction" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("messageId", "userId", "reaction")
);
CREATE INDEX "MessageReaction_userId_createdAt_idx" ON "MessageReaction"("userId", "createdAt");
CREATE TABLE "MessageAttachment" (
  "id" UUID NOT NULL,
  "messageId" UUID NOT NULL,
  "objectKey" VARCHAR(1000) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(120) NOT NULL,
  "byteSize" BIGINT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageAttachment_objectKey_key" ON "MessageAttachment"("objectKey");
CREATE INDEX "MessageAttachment_messageId_createdAt_idx" ON "MessageAttachment"("messageId", "createdAt");

CREATE TABLE "PassRequestHistory" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "fromState" "PassRequestState",
  "toState" "PassRequestState" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PassRequestHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PassRequestHistory_requestId_createdAt_idx" ON "PassRequestHistory"("requestId", "createdAt");
CREATE INDEX "PassRequest_state_submittedAt_idx" ON "PassRequest"("state", "submittedAt");

CREATE TABLE "CareerApplication" (
  "id" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "opportunityId" UUID NOT NULL,
  "state" "CareerApplicationState" NOT NULL DEFAULT 'SUBMITTED',
  "coverLetter" TEXT,
  "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CareerApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CareerApplication_studentId_opportunityId_key" ON "CareerApplication"("studentId", "opportunityId");
CREATE INDEX "CareerApplication_studentId_state_appliedAt_idx" ON "CareerApplication"("studentId", "state", "appliedAt");
CREATE INDEX "CareerApplication_opportunityId_state_appliedAt_idx" ON "CareerApplication"("opportunityId", "state", "appliedAt");
CREATE TABLE "CareerApplicationHistory" (
  "id" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "fromState" "CareerApplicationState",
  "toState" "CareerApplicationState" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareerApplicationHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CareerApplicationHistory_applicationId_createdAt_idx" ON "CareerApplicationHistory"("applicationId", "createdAt");
CREATE TABLE "CareerResume" (
  "id" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "headline" VARCHAR(200),
  "summary" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CareerResume_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CareerResume_studentId_key" ON "CareerResume"("studentId");
CREATE TABLE "CareerResumeSkill" (
  "id" UUID NOT NULL,
  "resumeId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "level" VARCHAR(40),
  CONSTRAINT "CareerResumeSkill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CareerResumeSkill_resumeId_name_key" ON "CareerResumeSkill"("resumeId", "name");
CREATE INDEX "CareerResumeSkill_resumeId_name_idx" ON "CareerResumeSkill"("resumeId", "name");
CREATE TABLE "CareerResumeEntry" (
  "id" UUID NOT NULL,
  "resumeId" UUID NOT NULL,
  "kind" "CareerEntryKind" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "organization" VARCHAR(200),
  "description" TEXT,
  "startedAt" DATE,
  "endedAt" DATE,
  "externalUrl" VARCHAR(2000),
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CareerResumeEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CareerResumeEntry_dates_check" CHECK ("startedAt" IS NULL OR "endedAt" IS NULL OR "endedAt" >= "startedAt")
);
CREATE INDEX "CareerResumeEntry_resumeId_kind_position_idx" ON "CareerResumeEntry"("resumeId", "kind", "position");
CREATE TABLE "CareerEvent" (
  "id" UUID NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6),
  "location" VARCHAR(200),
  "externalUrl" VARCHAR(2000),
  "isDemo" BOOLEAN NOT NULL DEFAULT TRUE,
  "state" "CareerEventState" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareerEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CareerEvent_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);
CREATE INDEX "CareerEvent_state_startsAt_idx" ON "CareerEvent"("state", "startsAt");
CREATE TABLE "CareerEventRegistration" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "state" "CareerRegistrationState" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareerEventRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CareerEventRegistration_eventId_studentId_key" ON "CareerEventRegistration"("eventId", "studentId");
CREATE INDEX "CareerEventRegistration_studentId_state_createdAt_idx" ON "CareerEventRegistration"("studentId", "state", "createdAt");
CREATE INDEX "CareerOpportunity_kind_state_closesAt_idx" ON "CareerOpportunity"("kind", "state", "closesAt");

ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_chatId_fkey" FOREIGN KEY ("replyToId", "chatId") REFERENCES "Message"("id", "chatId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PassRequest" ADD CONSTRAINT "PassRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PassRequestHistory" ADD CONSTRAINT "PassRequestHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PassRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PassRequestHistory" ADD CONSTRAINT "PassRequestHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CareerApplication" ADD CONSTRAINT "CareerApplication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareerApplication" ADD CONSTRAINT "CareerApplication_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CareerOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareerApplicationHistory" ADD CONSTRAINT "CareerApplicationHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CareerApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareerApplicationHistory" ADD CONSTRAINT "CareerApplicationHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareerResume" ADD CONSTRAINT "CareerResume_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareerResumeSkill" ADD CONSTRAINT "CareerResumeSkill_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "CareerResume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerResumeEntry" ADD CONSTRAINT "CareerResumeEntry_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "CareerResume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerEventRegistration" ADD CONSTRAINT "CareerEventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CareerEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareerEventRegistration" ADD CONSTRAINT "CareerEventRegistration_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
