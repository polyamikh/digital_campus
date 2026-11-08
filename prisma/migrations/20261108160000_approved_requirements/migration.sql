-- No application records existed when this migration was prepared. Do not
-- invent backfills if the database changes before deployment; require review.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "User" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Assessment" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "AssessmentWeight" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "ServiceRequest" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "AnnouncementVersion" LIMIT 1) THEN
        RAISE EXCEPTION 'Digital Campus requirements migration requires reviewed backfill for existing application records';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "TemporaryDemoPass" AS pass
          JOIN "PassRequest" AS request ON request."id" = pass."requestId"
         WHERE request."studentId" <> pass."studentId"
    ) THEN
        RAISE EXCEPTION 'Temporary demo pass owner mismatch requires manual review';
    END IF;
END;
$$;

-- CreateEnum
CREATE TYPE "LessonKind" AS ENUM ('CLASS', 'EXAM');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT');

-- CreateEnum
CREATE TYPE "ServiceRequestCategory" AS ENUM ('STUDY_CERTIFICATE', 'STUDY_PERIOD_CERTIFICATE', 'GRADE_TRANSCRIPT', 'ACADEMIC_QUESTION', 'PERSONAL_DATA_CORRECTION');

-- AlterEnum
ALTER TYPE "CalendarEventKind" ADD VALUE 'EXAM';

-- DropForeignKey
ALTER TABLE "Assessment" DROP CONSTRAINT "Assessment_componentId_fkey";

-- DropForeignKey
ALTER TABLE "AssessmentWeight" DROP CONSTRAINT "AssessmentWeight_componentId_fkey";

-- DropForeignKey
ALTER TABLE "TemporaryDemoPass" DROP CONSTRAINT "TemporaryDemoPass_requestId_fkey";

-- AlterTable
ALTER TABLE "AnnouncementVersion" ADD COLUMN     "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "structureVersionId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "AssessmentWeight" ADD COLUMN     "componentName" VARCHAR(160) NOT NULL,
ADD COLUMN     "courseId" UUID NOT NULL,
ADD COLUMN     "isRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "structureVersionId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "examinerId" UUID,
ADD COLUMN     "kind" "LessonKind" NOT NULL DEFAULT 'CLASS',
ALTER COLUMN "teacherId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "category" "ServiceRequestCategory" NOT NULL,
ALTER COLUMN "kind" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activatedAt" TIMESTAMPTZ(6),
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AccountActivation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AccountActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentStructureVersion" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),
    "reason" TEXT,

    CONSTRAINT "AssessmentStructureVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "markedById" UUID NOT NULL,
    "markedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleStaffReservation" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScheduleStaffReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountActivation_tokenHash_key" ON "AccountActivation"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountActivation_userId_expiresAt_idx" ON "AccountActivation"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AssessmentStructureVersion_courseId_publishedAt_idx" ON "AssessmentStructureVersion"("courseId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentStructureVersion_courseId_version_key" ON "AssessmentStructureVersion"("courseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentStructureVersion_id_courseId_key" ON "AssessmentStructureVersion"("id", "courseId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_lessonId_status_idx" ON "AttendanceRecord"("lessonId", "status");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_markedAt_idx" ON "AttendanceRecord"("studentId", "markedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_lessonId_studentId_key" ON "AttendanceRecord"("lessonId", "studentId");

-- CreateIndex
CREATE INDEX "ScheduleStaffReservation_staffId_startsAt_idx" ON "ScheduleStaffReservation"("staffId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleStaffReservation_lessonId_staffId_key" ON "ScheduleStaffReservation"("lessonId", "staffId");

-- CreateIndex
CREATE INDEX "AnnouncementVersion_publishedAt_requiresAcknowledgement_idx" ON "AnnouncementVersion"("publishedAt", "requiresAcknowledgement");

-- CreateIndex
CREATE INDEX "Assessment_structureVersionId_componentId_idx" ON "Assessment"("structureVersionId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentComponent_id_courseId_key" ON "AssessmentComponent"("id", "courseId");

-- CreateIndex
CREATE INDEX "AssessmentWeight_structureVersionId_position_idx" ON "AssessmentWeight"("structureVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentWeight_structureVersionId_componentId_key" ON "AssessmentWeight"("structureVersionId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentWeight_structureVersionId_componentId_courseId_key" ON "AssessmentWeight"("structureVersionId", "componentId", "courseId");

-- CreateIndex
CREATE INDEX "Lesson_examinerId_startsAt_state_idx" ON "Lesson"("examinerId", "startsAt", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_id_groupId_key" ON "Lesson"("id", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PassRequest_id_studentId_key" ON "PassRequest"("id", "studentId");

-- CreateIndex
CREATE INDEX "ServiceRequest_category_state_deadlineAt_idx" ON "ServiceRequest"("category", "state", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "TemporaryDemoPass_requestId_studentId_key" ON "TemporaryDemoPass"("requestId", "studentId");

-- AddForeignKey
ALTER TABLE "AccountActivation" ADD CONSTRAINT "AccountActivation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountActivation" ADD CONSTRAINT "AccountActivation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentStructureVersion" ADD CONSTRAINT "AssessmentStructureVersion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentStructureVersion" ADD CONSTRAINT "AssessmentStructureVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentWeight" ADD CONSTRAINT "AssessmentWeight_componentId_courseId_fkey" FOREIGN KEY ("componentId", "courseId") REFERENCES "AssessmentComponent"("id", "courseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentWeight" ADD CONSTRAINT "AssessmentWeight_structureVersionId_courseId_fkey" FOREIGN KEY ("structureVersionId", "courseId") REFERENCES "AssessmentStructureVersion"("id", "courseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_componentId_courseId_fkey" FOREIGN KEY ("componentId", "courseId") REFERENCES "AssessmentComponent"("id", "courseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_structureVersionId_courseId_fkey" FOREIGN KEY ("structureVersionId", "courseId") REFERENCES "AssessmentStructureVersion"("id", "courseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_structureVersionId_componentId_courseId_fkey" FOREIGN KEY ("structureVersionId", "componentId", "courseId") REFERENCES "AssessmentWeight"("structureVersionId", "componentId", "courseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_lessonId_groupId_fkey" FOREIGN KEY ("lessonId", "groupId") REFERENCES "Lesson"("id", "groupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_groupId_studentId_fkey" FOREIGN KEY ("groupId", "studentId") REFERENCES "GroupMembership"("groupId", "studentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleStaffReservation" ADD CONSTRAINT "ScheduleStaffReservation_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleStaffReservation" ADD CONSTRAINT "ScheduleStaffReservation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryDemoPass" ADD CONSTRAINT "TemporaryDemoPass_requestId_studentId_fkey" FOREIGN KEY ("requestId", "studentId") REFERENCES "PassRequest"("id", "studentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep activated accounts and password credentials in the same lifecycle state.
ALTER TABLE "User"
    ADD CONSTRAINT "User_activation_password_consistency_ck"
    CHECK (("activatedAt" IS NULL AND "passwordHash" IS NULL)
        OR ("activatedAt" IS NOT NULL AND "passwordHash" IS NOT NULL));

ALTER TABLE "AccountActivation"
    ADD CONSTRAINT "AccountActivation_expiry_after_creation_ck"
    CHECK ("expiresAt" > "createdAt");

CREATE UNIQUE INDEX "AccountActivation_one_open_per_user_uq"
    ON "AccountActivation" ("userId")
    WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;

-- AssessmentWeight is the versioned allocation table. The physical column
-- "weight" is retained for compatibility and now means maximum points.
ALTER TABLE "AssessmentWeight"
    ADD CONSTRAINT "AssessmentWeight_maximum_points_ck"
    CHECK ("weight" > 0 AND "weight" <= 100);

ALTER TABLE "AssessmentStructureVersion"
    ADD CONSTRAINT "AssessmentStructureVersion_positive_version_ck"
    CHECK ("version" > 0);

CREATE FUNCTION "guard_assessment_structure_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    component_count BIGINT;
    total_points NUMERIC;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."publishedAt" IS NOT NULL THEN
            RAISE EXCEPTION 'Published assessment structure versions are immutable';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD."publishedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Published assessment structure versions are immutable';
    END IF;

    IF OLD."publishedAt" IS NULL AND NEW."publishedAt" IS NOT NULL THEN
        SELECT count(*), COALESCE(sum("weight"), 0)
          INTO component_count, total_points
          FROM "AssessmentWeight"
         WHERE "structureVersionId" = NEW."id";

        IF component_count = 0 OR total_points <> 100 THEN
            RAISE EXCEPTION 'Assessment structure version must contain components totaling exactly 100 points (found %, %)',
                component_count, total_points;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "AssessmentStructureVersion_immutable_trg"
    BEFORE UPDATE OR DELETE ON "AssessmentStructureVersion"
    FOR EACH ROW EXECUTE FUNCTION "guard_assessment_structure_version"();

CREATE FUNCTION "guard_assessment_weight_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    version_id UUID;
    version_published_at TIMESTAMPTZ(6);
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW."structureVersionId" <> OLD."structureVersionId"
        OR NEW."componentId" <> OLD."componentId"
        OR NEW."courseId" <> OLD."courseId"
    ) THEN
        RAISE EXCEPTION 'Assessment allocation rows cannot be moved between versions or components';
    END IF;

    version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."structureVersionId" ELSE NEW."structureVersionId" END;
    SELECT "publishedAt" INTO version_published_at
      FROM "AssessmentStructureVersion"
     WHERE "id" = version_id
     FOR UPDATE;

    IF version_published_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot change allocations in a published assessment structure version';
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "AssessmentWeight_version_guard_trg"
    BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentWeight"
    FOR EACH ROW EXECUTE FUNCTION "guard_assessment_weight_version"();

CREATE FUNCTION "guard_assessment_published_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    version_published_at TIMESTAMPTZ(6);
BEGIN
    IF NEW."state" IN ('PUBLISHED', 'CLOSED') THEN
        SELECT "publishedAt" INTO version_published_at
          FROM "AssessmentStructureVersion"
         WHERE "id" = NEW."structureVersionId" AND "courseId" = NEW."courseId";
        IF version_published_at IS NULL THEN
            RAISE EXCEPTION 'An assessment cannot be published before its structure version';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW."structureVersionId" <> OLD."structureVersionId"
        OR NEW."componentId" <> OLD."componentId"
        OR NEW."courseId" <> OLD."courseId"
    ) AND (
        OLD."state" IN ('PUBLISHED', 'CLOSED')
        OR EXISTS (
            SELECT 1
              FROM "GradebookEntry" AS entry
              JOIN "GradeRevision" AS revision ON revision."entryId" = entry."id"
             WHERE entry."assessmentId" = OLD."id"
        )
    ) THEN
        RAISE EXCEPTION 'An assessment with published or draft grade history cannot be moved to another structure component';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Assessment_structure_guard_trg"
    BEFORE INSERT OR UPDATE ON "Assessment"
    FOR EACH ROW EXECUTE FUNCTION "guard_assessment_published_version"();

CREATE FUNCTION "check_grade_revision_assessment_structure"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    assessment_state "AssessmentState";
    structure_published_at TIMESTAMPTZ(6);
BEGIN
    SELECT assessment."state", structure."publishedAt"
      INTO assessment_state, structure_published_at
      FROM "GradebookEntry" AS entry
      JOIN "Assessment" AS assessment ON assessment."id" = entry."assessmentId"
      JOIN "AssessmentStructureVersion" AS structure
        ON structure."id" = assessment."structureVersionId"
       AND structure."courseId" = assessment."courseId"
     WHERE entry."id" = NEW."entryId";

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grade revision has no matching assessment structure';
    END IF;
    IF NEW."state" = 'PUBLISHED'
       AND (assessment_state = 'DRAFT' OR structure_published_at IS NULL) THEN
        RAISE EXCEPTION 'A grade cannot be published before its assessment and structure';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "GradeRevision_assessment_structure_trg"
    BEFORE INSERT OR UPDATE OF "entryId", "score", "state" ON "GradeRevision"
    FOR EACH ROW EXECUTE FUNCTION "check_grade_revision_assessment_structure"();

-- Lesson is the canonical event for both classes and exams. This check makes
-- the role of teacherId/examinerId explicit while allowing both to be occupied.
ALTER TABLE "Lesson"
    ADD CONSTRAINT "Lesson_kind_staff_ck"
    CHECK (("kind" = 'CLASS' AND "teacherId" IS NOT NULL AND "examinerId" IS NULL)
        OR ("kind" = 'EXAM' AND "examinerId" IS NOT NULL));

ALTER TABLE "ScheduleStaffReservation"
    ADD CONSTRAINT "ScheduleStaffReservation_positive_duration_ck"
    CHECK ("endsAt" > "startsAt");

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "ScheduleStaffReservation"
    ADD CONSTRAINT "ScheduleStaffReservation_staff_no_overlap_excl"
    EXCLUDE USING gist (
        "staffId" WITH =,
        tstzrange("startsAt", "endsAt", '[)') WITH &&
    ) WHERE ("isActive");

-- Replace the original teacher-only exclusion with the synchronized staff
-- reservation constraint below. A substitute occupies the slot in place of
-- the assigned teacher; the examiner is reserved as an additional staff member.
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_teacher_no_overlap_excl";

CREATE FUNCTION "sync_lesson_staff_reservations"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM "ScheduleStaffReservation" WHERE "lessonId" = NEW."id";

    IF NEW."state" = 'SCHEDULED' THEN
        INSERT INTO "ScheduleStaffReservation" (
            "id", "lessonId", "staffId", "startsAt", "endsAt", "isActive"
        )
        SELECT gen_random_uuid(), NEW."id", occupied."staffId", NEW."startsAt", NEW."endsAt", TRUE
          FROM (
              SELECT COALESCE(NEW."substituteId", NEW."teacherId") AS "staffId"
              UNION
              SELECT NEW."examinerId" AS "staffId"
          ) AS occupied
         WHERE occupied."staffId" IS NOT NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Lesson_staff_reservations_sync_trg"
    AFTER INSERT OR UPDATE OF "teacherId", "substituteId", "examinerId", "startsAt", "endsAt", "state"
    ON "Lesson"
    FOR EACH ROW EXECUTE FUNCTION "sync_lesson_staff_reservations"();

-- Backfill only actual existing scheduled slots; the inspected local DB has
-- no Lesson rows, so this inserts nothing unless the database changed.
INSERT INTO "ScheduleStaffReservation" (
    "id", "lessonId", "staffId", "startsAt", "endsAt", "isActive"
)
SELECT gen_random_uuid(), lesson."id", occupied."staffId", lesson."startsAt", lesson."endsAt", TRUE
  FROM "Lesson" AS lesson
  CROSS JOIN LATERAL (
      SELECT COALESCE(lesson."substituteId", lesson."teacherId") AS "staffId"
      UNION
      SELECT lesson."examinerId" AS "staffId"
  ) AS occupied
 WHERE lesson."state" = 'SCHEDULED'
   AND occupied."staffId" IS NOT NULL;

CREATE FUNCTION "check_attendance_group_membership_period"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    lesson_start TIMESTAMPTZ(6);
    membership_start TIMESTAMPTZ(6);
    membership_end TIMESTAMPTZ(6);
BEGIN
    SELECT "startsAt" INTO lesson_start
      FROM "Lesson"
     WHERE "id" = NEW."lessonId" AND "groupId" = NEW."groupId";
    IF lesson_start IS NULL THEN
        RAISE EXCEPTION 'Attendance lesson/group does not exist';
    END IF;

    SELECT "startsAt", "endsAt" INTO membership_start, membership_end
      FROM "GroupMembership"
     WHERE "groupId" = NEW."groupId" AND "studentId" = NEW."studentId";
    IF NOT FOUND
       OR (membership_start IS NOT NULL AND membership_start > lesson_start)
       OR (membership_end IS NOT NULL AND membership_end <= lesson_start) THEN
        RAISE EXCEPTION 'Student is not a member of this lesson group at lesson time';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "AttendanceRecord_membership_period_trg"
    BEFORE INSERT OR UPDATE OF "lessonId", "groupId", "studentId"
    ON "AttendanceRecord"
    FOR EACH ROW EXECUTE FUNCTION "check_attendance_group_membership_period"();

-- Exact category-to-SLA mapping; working-day dates are still computed from
-- ProductionCalendarDay by server logic in Europe/Moscow.
ALTER TABLE "ServiceRequest"
    ADD CONSTRAINT "ServiceRequest_category_sla_ck"
    CHECK (
        ("category" IN ('STUDY_CERTIFICATE', 'STUDY_PERIOD_CERTIFICATE', 'GRADE_TRANSCRIPT') AND "slaWorkingDays" = 3)
        OR ("category" IN ('ACADEMIC_QUESTION', 'PERSONAL_DATA_CORRECTION') AND "slaWorkingDays" = 5)
    );

CREATE FUNCTION "check_acknowledgement_required_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    requires_ack BOOLEAN;
BEGIN
    SELECT "requiresAcknowledgement" INTO requires_ack
      FROM "AnnouncementVersion"
     WHERE "id" = NEW."versionId" AND "announcementId" = NEW."announcementId";
    IF requires_ack IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Acknowledgement can only be recorded for a version that requires it';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Acknowledgement_required_version_trg"
    BEFORE INSERT ON "Acknowledgement"
    FOR EACH ROW EXECUTE FUNCTION "check_acknowledgement_required_version"();

CREATE FUNCTION "protect_published_announcement_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD."publishedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Published announcement versions are immutable; publish a new version';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "AnnouncementVersion_immutable_trg"
    BEFORE UPDATE ON "AnnouncementVersion"
    FOR EACH ROW EXECUTE FUNCTION "protect_published_announcement_version"();

CREATE FUNCTION "check_temporary_demo_pass_request"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    request_kind "PassRequestKind";
BEGIN
    SELECT "kind" INTO request_kind
      FROM "PassRequest"
     WHERE "id" = NEW."requestId" AND "studentId" = NEW."studentId";
    IF request_kind IS DISTINCT FROM 'TEMPORARY_DEMO_QR' THEN
        RAISE EXCEPTION 'Temporary demo pass must reference its owner''s demo QR request';
    END IF;
    IF NEW."validDate" <> (NEW."issuedAt" AT TIME ZONE 'Europe/Moscow')::DATE THEN
        RAISE EXCEPTION 'Temporary demo pass validDate must match issuance date in Europe/Moscow';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "TemporaryDemoPass_request_and_moscow_date_trg"
    BEFORE INSERT OR UPDATE OF "requestId", "studentId", "validDate", "issuedAt"
    ON "TemporaryDemoPass"
    FOR EACH ROW EXECUTE FUNCTION "check_temporary_demo_pass_request"();
