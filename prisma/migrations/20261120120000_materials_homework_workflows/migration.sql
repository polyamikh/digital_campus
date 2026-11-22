-- Additive coursework workflow support. Existing rows and grade history are retained.
ALTER TABLE "Homework"
  ADD COLUMN "criteria" TEXT,
  ADD COLUMN "groupId" UUID,
  ADD COLUMN "allowText" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "allowFile" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "allowLink" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_has_allowed_submission_format_check" CHECK ("allowText" OR "allowFile" OR "allowLink");

ALTER TABLE "SubmissionRevision"
  ADD COLUMN "externalUrl" VARCHAR(2000),
  ADD COLUMN "fileName" VARCHAR(255),
  ADD COLUMN "mimeType" VARCHAR(120),
  ADD COLUMN "byteSize" BIGINT,
  ADD COLUMN "submittedAt" TIMESTAMPTZ(6);

ALTER TABLE "Material"
  ADD COLUMN "externalUrl" VARCHAR(2000),
  ADD COLUMN "folderId" UUID;

CREATE TABLE "MaterialFolder" (
  "id" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "groupId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialAudience" (
  "materialId" UUID NOT NULL,
  "groupId" UUID NOT NULL,
  CONSTRAINT "MaterialAudience_pkey" PRIMARY KEY ("materialId", "groupId")
);

CREATE TABLE "MaterialFile" (
  "id" UUID NOT NULL,
  "materialId" UUID NOT NULL,
  "objectKey" VARCHAR(1000) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(120) NOT NULL,
  "byteSize" BIGINT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomeworkMaterial" (
  "homeworkId" UUID NOT NULL,
  "materialId" UUID NOT NULL,
  CONSTRAINT "HomeworkMaterial_pkey" PRIMARY KEY ("homeworkId", "materialId")
);

CREATE TABLE "SubmissionReview" (
  "id" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "revisionId" UUID NOT NULL,
  "reviewerId" UUID NOT NULL,
  "state" "HomeworkSubmissionState" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubmissionRevision_id_submissionId_key" ON "SubmissionRevision"("id", "submissionId");
CREATE UNIQUE INDEX "MaterialFile_objectKey_key" ON "MaterialFile"("objectKey");
CREATE UNIQUE INDEX "MaterialFolder_courseId_groupId_name_key" ON "MaterialFolder"("courseId", "groupId", "name");
CREATE INDEX "MaterialFolder_authorId_courseId_groupId_idx" ON "MaterialFolder"("authorId", "courseId", "groupId");
CREATE INDEX "MaterialAudience_groupId_materialId_idx" ON "MaterialAudience"("groupId", "materialId");
CREATE INDEX "MaterialFile_materialId_createdAt_idx" ON "MaterialFile"("materialId", "createdAt");
CREATE INDEX "HomeworkMaterial_materialId_homeworkId_idx" ON "HomeworkMaterial"("materialId", "homeworkId");
CREATE INDEX "SubmissionReview_submissionId_createdAt_idx" ON "SubmissionReview"("submissionId", "createdAt");
CREATE INDEX "Homework_groupId_state_deadline_idx" ON "Homework"("groupId", "state", "deadline");
CREATE INDEX "Material_folderId_state_idx" ON "Material"("folderId", "state");

ALTER TABLE "Homework" ADD CONSTRAINT "Homework_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_courseId_groupId_fkey" FOREIGN KEY ("courseId", "groupId") REFERENCES "CourseGroup"("courseId", "groupId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "Material_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MaterialFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialFolder" ADD CONSTRAINT "MaterialFolder_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialFolder" ADD CONSTRAINT "MaterialFolder_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialFolder" ADD CONSTRAINT "MaterialFolder_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialFolder" ADD CONSTRAINT "MaterialFolder_courseId_groupId_fkey" FOREIGN KEY ("courseId", "groupId") REFERENCES "CourseGroup"("courseId", "groupId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialAudience" ADD CONSTRAINT "MaterialAudience_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAudience" ADD CONSTRAINT "MaterialAudience_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialFile" ADD CONSTRAINT "MaterialFile_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomeworkMaterial" ADD CONSTRAINT "HomeworkMaterial_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomeworkMaterial" ADD CONSTRAINT "HomeworkMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionReview" ADD CONSTRAINT "SubmissionReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionReview" ADD CONSTRAINT "SubmissionReview_revisionId_submissionId_fkey" FOREIGN KEY ("revisionId", "submissionId") REFERENCES "SubmissionRevision"("id", "submissionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionReview" ADD CONSTRAINT "SubmissionReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing materials remain visible to the groups already linked to their course.
INSERT INTO "MaterialAudience" ("materialId", "groupId")
SELECT m."id", cg."groupId" FROM "Material" m
JOIN "CourseGroup" cg ON cg."courseId" = m."courseId"
ON CONFLICT DO NOTHING;
