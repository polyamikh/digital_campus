-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'DEAN');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LessonState" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ScheduleChangeKind" AS ENUM ('RESCHEDULE', 'ROOM', 'FORMAT', 'CANCEL', 'SUBSTITUTE');

-- CreateEnum
CREATE TYPE "ScheduleRequestState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ConsentState" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "AssessmentState" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GradeRevisionState" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "HomeworkSubmissionState" AS ENUM ('TO_SUBMIT', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'CHECKED');

-- CreateEnum
CREATE TYPE "TestAttemptState" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('DOCUMENT', 'APPEAL', 'REQUEST');

-- CreateEnum
CREATE TYPE "ServiceRequestState" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'CLARIFICATION_REQUESTED', 'READY_FOR_ISSUE', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PassRequestKind" AS ENUM ('TEMPORARY_DEMO_QR', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "PassRequestState" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ISSUED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('CRITICAL_OFFICIAL', 'OFFICIAL_ANNOUNCEMENT', 'COURSE_ANNOUNCEMENT', 'SCHEDULE', 'HOMEWORK', 'TEST', 'REQUEST', 'TASK', 'CHAT', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP');

-- CreateEnum
CREATE TYPE "CalendarDayKind" AS ENUM ('WORKING', 'NON_WORKING');

-- CreateEnum
CREATE TYPE "AssignedTaskState" AS ENUM ('TO_DO', 'IN_PROGRESS', 'NEEDS_REVISION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PersonalTaskState" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarEventKind" AS ENUM ('LESSON', 'HOMEWORK_DEADLINE', 'TEST_DEADLINE', 'PERSONAL_TASK', 'ASSIGNED_TASK');

-- CreateEnum
CREATE TYPE "AIMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AIDraftKind" AS ENUM ('STUDY_PLAN', 'MATERIAL', 'TEST', 'RUBRIC_HINT', 'REPORT', 'ACTION', 'OTHER');

-- CreateEnum
CREATE TYPE "AIActionState" AS ENUM ('PREVIEWED', 'CONFIRMED', 'EXECUTING', 'SUCCEEDED', 'PARTIALLY_FAILED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AIReportState" AS ENUM ('DRAFT', 'CONFIRMED', 'EXPORTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CareerOpportunityState" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "login" VARCHAR(190) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "settings" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "userId" UUID NOT NULL,
    "activeRole" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6),
    "endsAt" TIMESTAMPTZ(6),

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60),
    "name" VARCHAR(200) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80),
    "name" VARCHAR(200) NOT NULL,
    "subjectId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseGroup" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "groupId" UUID NOT NULL,

    CONSTRAINT "CourseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherAssignment" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6),
    "endsAt" TIMESTAMPTZ(6),

    CONSTRAINT "TeacherAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionCalendarYear" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "sourceName" VARCHAR(300) NOT NULL,
    "sourceUrl" VARCHAR(2000) NOT NULL,
    "sourcePublishedAt" TIMESTAMPTZ(6),
    "importedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ProductionCalendarYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionCalendarDay" (
    "id" UUID NOT NULL,
    "calendarId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CalendarDayKind" NOT NULL,
    "note" VARCHAR(300),

    CONSTRAINT "ProductionCalendarDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentComponent" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AssessmentComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentWeight" (
    "id" UUID NOT NULL,
    "componentId" UUID NOT NULL,
    "weight" DECIMAL(7,4) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "componentId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "state" "AssessmentState" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradebookEntry" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "currentRevisionId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GradebookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeRevision" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "retakeId" UUID,
    "score" DECIMAL(5,2) NOT NULL,
    "state" "GradeRevisionState" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "GradeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retake" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Retake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalGradeClosure" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "closedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FinalGradeClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmedAcademicDebt" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "confirmedById" UUID NOT NULL,
    "confirmedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "reason" TEXT,

    CONSTRAINT "ConfirmedAcademicDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Homework" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "assessmentId" UUID,
    "title" VARCHAR(240) NOT NULL,
    "instructions" TEXT NOT NULL,
    "deadline" TIMESTAMPTZ(6),
    "state" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "aiPolicy" JSONB,
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "homeworkId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "state" "HomeworkSubmissionState" NOT NULL DEFAULT 'TO_SUBMIT',
    "submittedAt" TIMESTAMPTZ(6),
    "reviewedAt" TIMESTAMPTZ(6),
    "feedback" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionRevision" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "objectKey" VARCHAR(1000),
    "textContent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Test" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "assessmentId" UUID,
    "title" VARCHAR(240) NOT NULL,
    "opensAt" TIMESTAMPTZ(6),
    "closesAt" TIMESTAMPTZ(6),
    "attemptLimit" INTEGER,
    "state" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "aiPolicy" JSONB,
    "publishedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "position" INTEGER NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestAttempt" (
    "id" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "state" "TestAttemptState" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(6),
    "reviewedAt" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestAnswer" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "response" JSONB NOT NULL,
    "score" DECIMAL(5,2),
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TestAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "state" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationVersion" (
    "id" UUID NOT NULL,
    "materialId" UUID,
    "homeworkId" UUID,
    "testId" UUID,
    "number" INTEGER NOT NULL,
    "state" "PublicationState" NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "PublicationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "substituteId" UUID,
    "roomId" UUID,
    "title" VARCHAR(240) NOT NULL,
    "format" VARCHAR(100),
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "state" "LessonState" NOT NULL DEFAULT 'SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonScheduleVersion" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleChangeRequest" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "kind" "ScheduleChangeKind" NOT NULL,
    "state" "ScheduleRequestState" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(6),
    "decidedById" UUID,
    "approvedProposalId" UUID,
    "decisionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ScheduleChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleChangeProposal" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6),
    "endsAt" TIMESTAMPTZ(6),
    "roomId" UUID,
    "format" VARCHAR(100),
    "substituteId" UUID,
    "cancelled" BOOLEAN,

    CONSTRAINT "ScheduleChangeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubstituteConsent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "state" "ConsentState" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMPTZ(6),

    CONSTRAINT "SubstituteConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "assignedToId" UUID,
    "kind" "RequestKind" NOT NULL,
    "state" "ServiceRequestState" NOT NULL DEFAULT 'SUBMITTED',
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaWorkingDays" INTEGER NOT NULL,
    "deadlineAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "rejectionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestCalendar" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "calendarId" UUID NOT NULL,

    CONSTRAINT "ServiceRequestCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestStatusHistory" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "fromState" "ServiceRequestState",
    "toState" "ServiceRequestState" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestClarification" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMPTZ(6),

    CONSTRAINT "RequestClarification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentArtifact" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "objectKey" VARCHAR(1000) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(150) NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "issuedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DocumentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "episodeStartedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassRequest" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "kind" "PassRequestKind" NOT NULL,
    "state" "PassRequestState" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PassRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemporaryDemoPass" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "validDate" DATE NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TemporaryDemoPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialAnnouncement" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "state" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OfficialAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementVersion" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AnnouncementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAnnouncementAudience" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "RoleAnnouncementAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAnnouncementAudience" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "groupId" UUID NOT NULL,

    CONSTRAINT "GroupAnnouncementAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acknowledgement" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "acknowledgedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Acknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAnnouncement" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "name" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMember" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(6),

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" VARCHAR(80) NOT NULL,
    "sourceId" UUID NOT NULL,
    "eventKey" VARCHAR(240) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMPTZ(6),
    "readAt" TIMESTAMPTZ(6),
    "mutedAt" TIMESTAMPTZ(6),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalTask" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "details" TEXT,
    "dueAt" TIMESTAMPTZ(6),
    "state" "PersonalTaskState" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PersonalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignedTask" (
    "id" UUID NOT NULL,
    "assignerId" UUID NOT NULL,
    "assigneeId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "details" TEXT,
    "dueAt" TIMESTAMPTZ(6),
    "state" "AssignedTaskState" NOT NULL DEFAULT 'TO_DO',
    "cancelledReason" TEXT,
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AssignedTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskHistory" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "fromState" "AssignedTaskState",
    "toState" "AssignedTaskState" NOT NULL,
    "previousAssigneeId" UUID,
    "nextAssigneeId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicCalendarEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "CalendarEventKind" NOT NULL,
    "sourceType" VARCHAR(80) NOT NULL,
    "sourceId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6),
    "lessonId" UUID,
    "homeworkId" UUID,
    "testId" UUID,
    "personalTaskId" UUID,
    "assignedTaskId" UUID,

    CONSTRAINT "AcademicCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "kind" "CalendarEventKind" NOT NULL,
    "sourceType" VARCHAR(80) NOT NULL,
    "sourceId" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL,
    "sentAt" TIMESTAMPTZ(6),
    "homeworkId" UUID,
    "testId" UUID,
    "personalTaskId" UUID,
    "assignedTaskId" UUID,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "AIMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "providerModel" VARCHAR(160),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAttachment" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "objectKey" VARCHAR(1000) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(150) NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AIAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIDraft" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "kind" "AIDraftKind" NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AIDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIContextReference" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "sourceType" VARCHAR(80) NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceVersion" INTEGER,
    "checkedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staleAt" TIMESTAMPTZ(6),
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "AIContextReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIActionPreview" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "actionType" VARCHAR(120) NOT NULL,
    "proposal" JSONB NOT NULL,
    "baseVersions" JSONB NOT NULL,
    "state" "AIActionState" NOT NULL DEFAULT 'PREVIEWED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AIActionPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIActionConfirmation" (
    "id" UUID NOT NULL,
    "previewId" UUID NOT NULL,
    "confirmedById" UUID NOT NULL,
    "confirmedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operationId" UUID NOT NULL,

    CONSTRAINT "AIActionConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIReport" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "state" "AIReportState" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(240) NOT NULL,
    "content" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "periodStart" TIMESTAMPTZ(6),
    "periodEnd" TIMESTAMPTZ(6),
    "sampleSize" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AIReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIFeedback" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "model" VARCHAR(160) NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(14,6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerCategory" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,

    CONSTRAINT "CareerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerOpportunity" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "organization" VARCHAR(240) NOT NULL,
    "description" TEXT NOT NULL,
    "location" VARCHAR(200),
    "closesAt" TIMESTAMPTZ(6),
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "state" "CareerOpportunityState" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "targetType" VARCHAR(100) NOT NULL,
    "targetId" UUID,
    "outcome" "AuditOutcome" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyOperation" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "operationKey" VARCHAR(240) NOT NULL,
    "operationType" VARCHAR(120) NOT NULL,
    "requestHash" VARCHAR(128) NOT NULL,
    "resultRefType" VARCHAR(100),
    "resultRefId" UUID,
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "IdempotencyOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordVersion" (
    "id" UUID NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" UUID,

    CONSTRAINT "RecordVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "UserRole_role_revokedAt_idx" ON "UserRole"("role", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_revokedAt_expiresAt_idx" ON "Session"("revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Group_code_key" ON "Group"("code");

-- CreateIndex
CREATE INDEX "GroupMembership_studentId_endsAt_idx" ON "GroupMembership"("studentId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_groupId_studentId_key" ON "GroupMembership"("groupId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_code_key" ON "Subject"("code");

-- CreateIndex
CREATE INDEX "Course_code_idx" ON "Course"("code");

-- CreateIndex
CREATE INDEX "Course_ownerId_idx" ON "Course"("ownerId");

-- CreateIndex
CREATE INDEX "Course_subjectId_idx" ON "Course"("subjectId");

-- CreateIndex
CREATE INDEX "CourseGroup_groupId_idx" ON "CourseGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseGroup_courseId_groupId_key" ON "CourseGroup"("courseId", "groupId");

-- CreateIndex
CREATE INDEX "TeacherAssignment_teacherId_endsAt_idx" ON "TeacherAssignment"("teacherId", "endsAt");

-- CreateIndex
CREATE INDEX "TeacherAssignment_courseId_groupId_idx" ON "TeacherAssignment"("courseId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAssignment_teacherId_courseId_groupId_key" ON "TeacherAssignment"("teacherId", "courseId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionCalendarYear_year_key" ON "ProductionCalendarYear"("year");

-- CreateIndex
CREATE INDEX "ProductionCalendarDay_date_kind_idx" ON "ProductionCalendarDay"("date", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionCalendarDay_calendarId_date_key" ON "ProductionCalendarDay"("calendarId", "date");

-- CreateIndex
CREATE INDEX "AssessmentComponent_courseId_isRequired_idx" ON "AssessmentComponent"("courseId", "isRequired");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentComponent_courseId_name_key" ON "AssessmentComponent"("courseId", "name");

-- CreateIndex
CREATE INDEX "AssessmentWeight_componentId_effectiveAt_idx" ON "AssessmentWeight"("componentId", "effectiveAt");

-- CreateIndex
CREATE INDEX "Assessment_courseId_groupId_state_idx" ON "Assessment"("courseId", "groupId", "state");

-- CreateIndex
CREATE INDEX "Assessment_componentId_idx" ON "Assessment"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "GradebookEntry_currentRevisionId_key" ON "GradebookEntry"("currentRevisionId");

-- CreateIndex
CREATE INDEX "GradebookEntry_studentId_createdAt_idx" ON "GradebookEntry"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GradebookEntry_assessmentId_studentId_key" ON "GradebookEntry"("assessmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "GradebookEntry_currentRevisionId_id_key" ON "GradebookEntry"("currentRevisionId", "id");

-- CreateIndex
CREATE INDEX "GradeRevision_entryId_state_publishedAt_idx" ON "GradeRevision"("entryId", "state", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GradeRevision_id_entryId_key" ON "GradeRevision"("id", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "Retake_entryId_attemptNo_key" ON "Retake"("entryId", "attemptNo");

-- CreateIndex
CREATE INDEX "FinalGradeClosure_courseId_closedAt_idx" ON "FinalGradeClosure"("courseId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinalGradeClosure_studentId_courseId_key" ON "FinalGradeClosure"("studentId", "courseId");

-- CreateIndex
CREATE INDEX "ConfirmedAcademicDebt_studentId_resolvedAt_idx" ON "ConfirmedAcademicDebt"("studentId", "resolvedAt");

-- CreateIndex
CREATE INDEX "ConfirmedAcademicDebt_courseId_confirmedAt_idx" ON "ConfirmedAcademicDebt"("courseId", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Homework_assessmentId_key" ON "Homework"("assessmentId");

-- CreateIndex
CREATE INDEX "Homework_courseId_state_deadline_idx" ON "Homework"("courseId", "state", "deadline");

-- CreateIndex
CREATE INDEX "Homework_authorId_createdAt_idx" ON "Homework"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_studentId_state_idx" ON "Submission"("studentId", "state");

-- CreateIndex
CREATE INDEX "Submission_homeworkId_state_idx" ON "Submission"("homeworkId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_homeworkId_studentId_key" ON "Submission"("homeworkId", "studentId");

-- CreateIndex
CREATE INDEX "SubmissionRevision_submissionId_createdAt_idx" ON "SubmissionRevision"("submissionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Test_assessmentId_key" ON "Test"("assessmentId");

-- CreateIndex
CREATE INDEX "Test_courseId_state_closesAt_idx" ON "Test"("courseId", "state", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_testId_position_key" ON "Question"("testId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Question_id_testId_key" ON "Question"("id", "testId");

-- CreateIndex
CREATE INDEX "TestAttempt_studentId_state_idx" ON "TestAttempt"("studentId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "TestAttempt_testId_studentId_attemptNo_key" ON "TestAttempt"("testId", "studentId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "TestAttempt_id_testId_key" ON "TestAttempt"("id", "testId");

-- CreateIndex
CREATE UNIQUE INDEX "TestAnswer_attemptId_questionId_key" ON "TestAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "Material_courseId_state_idx" ON "Material"("courseId", "state");

-- CreateIndex
CREATE INDEX "Material_authorId_idx" ON "Material"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationVersion_materialId_number_key" ON "PublicationVersion"("materialId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationVersion_homeworkId_number_key" ON "PublicationVersion"("homeworkId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationVersion_testId_number_key" ON "PublicationVersion"("testId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Lesson_groupId_startsAt_state_idx" ON "Lesson"("groupId", "startsAt", "state");

-- CreateIndex
CREATE INDEX "Lesson_teacherId_startsAt_state_idx" ON "Lesson"("teacherId", "startsAt", "state");

-- CreateIndex
CREATE INDEX "Lesson_roomId_startsAt_state_idx" ON "Lesson"("roomId", "startsAt", "state");

-- CreateIndex
CREATE INDEX "LessonScheduleVersion_changedAt_idx" ON "LessonScheduleVersion"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonScheduleVersion_lessonId_version_key" ON "LessonScheduleVersion"("lessonId", "version");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_state_submittedAt_idx" ON "ScheduleChangeRequest"("state", "submittedAt");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_lessonId_baseVersion_idx" ON "ScheduleChangeRequest"("lessonId", "baseVersion");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_requesterId_state_idx" ON "ScheduleChangeRequest"("requesterId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleChangeRequest_approvedProposalId_id_key" ON "ScheduleChangeRequest"("approvedProposalId", "id");

-- CreateIndex
CREATE INDEX "ScheduleChangeProposal_requestId_idx" ON "ScheduleChangeProposal"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleChangeProposal_id_requestId_key" ON "ScheduleChangeProposal"("id", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleChangeProposal_id_requestId_substituteId_key" ON "ScheduleChangeProposal"("id", "requestId", "substituteId");

-- CreateIndex
CREATE UNIQUE INDEX "SubstituteConsent_requestId_teacherId_key" ON "SubstituteConsent"("requestId", "teacherId");

-- CreateIndex
CREATE INDEX "ServiceRequest_studentId_submittedAt_idx" ON "ServiceRequest"("studentId", "submittedAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_state_deadlineAt_idx" ON "ServiceRequest"("state", "deadlineAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_assignedToId_state_deadlineAt_idx" ON "ServiceRequest"("assignedToId", "state", "deadlineAt");

-- CreateIndex
CREATE INDEX "ServiceRequestCalendar_calendarId_requestId_idx" ON "ServiceRequestCalendar"("calendarId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequestCalendar_requestId_calendarId_key" ON "ServiceRequestCalendar"("requestId", "calendarId");

-- CreateIndex
CREATE INDEX "RequestStatusHistory_requestId_createdAt_idx" ON "RequestStatusHistory"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestClarification_requestId_requestedAt_idx" ON "RequestClarification"("requestId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentArtifact_objectKey_key" ON "DocumentArtifact"("objectKey");

-- CreateIndex
CREATE INDEX "DocumentArtifact_requestId_issuedAt_idx" ON "DocumentArtifact"("requestId", "issuedAt");

-- CreateIndex
CREATE INDEX "Escalation_closedAt_createdAt_idx" ON "Escalation"("closedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_requestId_episodeStartedAt_key" ON "Escalation"("requestId", "episodeStartedAt");

-- CreateIndex
CREATE INDEX "PassRequest_studentId_state_submittedAt_idx" ON "PassRequest"("studentId", "state", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TemporaryDemoPass_requestId_key" ON "TemporaryDemoPass"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "TemporaryDemoPass_tokenHash_key" ON "TemporaryDemoPass"("tokenHash");

-- CreateIndex
CREATE INDEX "TemporaryDemoPass_studentId_validDate_revokedAt_expiresAt_idx" ON "TemporaryDemoPass"("studentId", "validDate", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TemporaryDemoPass_studentId_validDate_key" ON "TemporaryDemoPass"("studentId", "validDate");

-- CreateIndex
CREATE INDEX "OfficialAnnouncement_state_createdAt_idx" ON "OfficialAnnouncement"("state", "createdAt");

-- CreateIndex
CREATE INDEX "AnnouncementVersion_publishedAt_idx" ON "AnnouncementVersion"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementVersion_announcementId_number_key" ON "AnnouncementVersion"("announcementId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementVersion_id_announcementId_key" ON "AnnouncementVersion"("id", "announcementId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAnnouncementAudience_announcementId_role_key" ON "RoleAnnouncementAudience"("announcementId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "GroupAnnouncementAudience_announcementId_groupId_key" ON "GroupAnnouncementAudience"("announcementId", "groupId");

-- CreateIndex
CREATE INDEX "Acknowledgement_announcementId_userId_idx" ON "Acknowledgement"("announcementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Acknowledgement_versionId_userId_key" ON "Acknowledgement"("versionId", "userId");

-- CreateIndex
CREATE INDEX "CourseAnnouncement_courseId_publishedAt_idx" ON "CourseAnnouncement"("courseId", "publishedAt");

-- CreateIndex
CREATE INDEX "ChatMember_userId_leftAt_idx" ON "ChatMember"("userId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMember_chatId_userId_key" ON "ChatMember"("chatId", "userId");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventKey_key" ON "Notification"("eventKey");

-- CreateIndex
CREATE INDEX "Notification_category_createdAt_idx" ON "Notification"("category", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_sourceType_sourceId_idx" ON "Notification"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_recipientId_readAt_createdAt_idx" ON "NotificationDelivery"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_recipientId_channel_key" ON "NotificationDelivery"("notificationId", "recipientId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");

-- CreateIndex
CREATE INDEX "PersonalTask_ownerId_state_dueAt_idx" ON "PersonalTask"("ownerId", "state", "dueAt");

-- CreateIndex
CREATE INDEX "AssignedTask_assignerId_state_dueAt_idx" ON "AssignedTask"("assignerId", "state", "dueAt");

-- CreateIndex
CREATE INDEX "AssignedTask_assigneeId_state_dueAt_idx" ON "AssignedTask"("assigneeId", "state", "dueAt");

-- CreateIndex
CREATE INDEX "TaskHistory_taskId_createdAt_idx" ON "TaskHistory"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AcademicCalendarEvent_userId_startsAt_idx" ON "AcademicCalendarEvent"("userId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicCalendarEvent_userId_sourceType_sourceId_key" ON "AcademicCalendarEvent"("userId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Reminder_scheduledAt_sentAt_idx" ON "Reminder"("scheduledAt", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_sourceType_sourceId_scheduledAt_key" ON "Reminder"("sourceType", "sourceId", "scheduledAt");

-- CreateIndex
CREATE INDEX "AIConversation_ownerId_updatedAt_idx" ON "AIConversation"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIConversation_id_ownerId_key" ON "AIConversation"("id", "ownerId");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIAttachment_objectKey_key" ON "AIAttachment"("objectKey");

-- CreateIndex
CREATE INDEX "AIAttachment_conversationId_revokedAt_idx" ON "AIAttachment"("conversationId", "revokedAt");

-- CreateIndex
CREATE INDEX "AIDraft_conversationId_createdAt_idx" ON "AIDraft"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIContextReference_conversationId_checkedAt_idx" ON "AIContextReference"("conversationId", "checkedAt");

-- CreateIndex
CREATE INDEX "AIContextReference_sourceType_sourceId_idx" ON "AIContextReference"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AIActionPreview_actorId_state_expiresAt_idx" ON "AIActionPreview"("actorId", "state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIActionPreview_id_actorId_key" ON "AIActionPreview"("id", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "AIActionConfirmation_operationId_key" ON "AIActionConfirmation"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "AIActionConfirmation_previewId_key" ON "AIActionConfirmation"("previewId");

-- CreateIndex
CREATE UNIQUE INDEX "AIActionConfirmation_operationId_confirmedById_key" ON "AIActionConfirmation"("operationId", "confirmedById");

-- CreateIndex
CREATE INDEX "AIReport_ownerId_state_expiresAt_idx" ON "AIReport"("ownerId", "state", "expiresAt");

-- CreateIndex
CREATE INDEX "AIFeedback_createdAt_idx" ON "AIFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIFeedback_userId_messageId_key" ON "AIFeedback"("userId", "messageId");

-- CreateIndex
CREATE INDEX "AIUsage_createdAt_model_idx" ON "AIUsage"("createdAt", "model");

-- CreateIndex
CREATE INDEX "AIUsage_conversationId_createdAt_idx" ON "AIUsage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CareerCategory_name_key" ON "CareerCategory"("name");

-- CreateIndex
CREATE INDEX "CareerOpportunity_categoryId_state_closesAt_idx" ON "CareerOpportunity"("categoryId", "state", "closesAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_createdAt_idx" ON "AuditEvent"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyOperation_operationType_createdAt_idx" ON "IdempotencyOperation"("operationType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyOperation_actorId_operationKey_key" ON "IdempotencyOperation"("actorId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyOperation_id_actorId_key" ON "IdempotencyOperation"("id", "actorId");

-- CreateIndex
CREATE INDEX "RecordVersion_entityType_entityId_changedAt_idx" ON "RecordVersion"("entityType", "entityId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecordVersion_entityType_entityId_version_key" ON "RecordVersion"("entityType", "entityId", "version");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseGroup" ADD CONSTRAINT "CourseGroup_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseGroup" ADD CONSTRAINT "CourseGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCalendarDay" ADD CONSTRAINT "ProductionCalendarDay_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "ProductionCalendarYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentComponent" ADD CONSTRAINT "AssessmentComponent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentWeight" ADD CONSTRAINT "AssessmentWeight_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "AssessmentComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "AssessmentComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradebookEntry" ADD CONSTRAINT "GradebookEntry_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradebookEntry" ADD CONSTRAINT "GradebookEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradebookEntry" ADD CONSTRAINT "GradebookEntry_currentRevisionId_id_fkey" FOREIGN KEY ("currentRevisionId", "id") REFERENCES "GradeRevision"("id", "entryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeRevision" ADD CONSTRAINT "GradeRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "GradebookEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeRevision" ADD CONSTRAINT "GradeRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeRevision" ADD CONSTRAINT "GradeRevision_retakeId_fkey" FOREIGN KEY ("retakeId") REFERENCES "Retake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retake" ADD CONSTRAINT "Retake_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "GradebookEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalGradeClosure" ADD CONSTRAINT "FinalGradeClosure_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalGradeClosure" ADD CONSTRAINT "FinalGradeClosure_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalGradeClosure" ADD CONSTRAINT "FinalGradeClosure_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmedAcademicDebt" ADD CONSTRAINT "ConfirmedAcademicDebt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmedAcademicDebt" ADD CONSTRAINT "ConfirmedAcademicDebt_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmedAcademicDebt" ADD CONSTRAINT "ConfirmedAcademicDebt_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRevision" ADD CONSTRAINT "SubmissionRevision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAnswer" ADD CONSTRAINT "TestAnswer_attemptId_testId_fkey" FOREIGN KEY ("attemptId", "testId") REFERENCES "TestAttempt"("id", "testId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAnswer" ADD CONSTRAINT "TestAnswer_questionId_testId_fkey" FOREIGN KEY ("questionId", "testId") REFERENCES "Question"("id", "testId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationVersion" ADD CONSTRAINT "PublicationVersion_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationVersion" ADD CONSTRAINT "PublicationVersion_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationVersion" ADD CONSTRAINT "PublicationVersion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonScheduleVersion" ADD CONSTRAINT "LessonScheduleVersion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_approvedProposalId_id_fkey" FOREIGN KEY ("approvedProposalId", "id") REFERENCES "ScheduleChangeProposal"("id", "requestId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeProposal" ADD CONSTRAINT "ScheduleChangeProposal_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScheduleChangeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeProposal" ADD CONSTRAINT "ScheduleChangeProposal_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeProposal" ADD CONSTRAINT "ScheduleChangeProposal_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubstituteConsent" ADD CONSTRAINT "SubstituteConsent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScheduleChangeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubstituteConsent" ADD CONSTRAINT "SubstituteConsent_proposalId_requestId_teacherId_fkey" FOREIGN KEY ("proposalId", "requestId", "teacherId") REFERENCES "ScheduleChangeProposal"("id", "requestId", "substituteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubstituteConsent" ADD CONSTRAINT "SubstituteConsent_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestCalendar" ADD CONSTRAINT "ServiceRequestCalendar_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestCalendar" ADD CONSTRAINT "ServiceRequestCalendar_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "ProductionCalendarYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStatusHistory" ADD CONSTRAINT "RequestStatusHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStatusHistory" ADD CONSTRAINT "RequestStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestClarification" ADD CONSTRAINT "RequestClarification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestClarification" ADD CONSTRAINT "RequestClarification_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassRequest" ADD CONSTRAINT "PassRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryDemoPass" ADD CONSTRAINT "TemporaryDemoPass_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PassRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryDemoPass" ADD CONSTRAINT "TemporaryDemoPass_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialAnnouncement" ADD CONSTRAINT "OfficialAnnouncement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementVersion" ADD CONSTRAINT "AnnouncementVersion_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "OfficialAnnouncement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAnnouncementAudience" ADD CONSTRAINT "RoleAnnouncementAudience_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "OfficialAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAnnouncementAudience" ADD CONSTRAINT "GroupAnnouncementAudience_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "OfficialAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAnnouncementAudience" ADD CONSTRAINT "GroupAnnouncementAudience_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acknowledgement" ADD CONSTRAINT "Acknowledgement_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "OfficialAnnouncement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acknowledgement" ADD CONSTRAINT "Acknowledgement_versionId_announcementId_fkey" FOREIGN KEY ("versionId", "announcementId") REFERENCES "AnnouncementVersion"("id", "announcementId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acknowledgement" ADD CONSTRAINT "Acknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAnnouncement" ADD CONSTRAINT "CourseAnnouncement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAnnouncement" ADD CONSTRAINT "CourseAnnouncement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTask" ADD CONSTRAINT "PersonalTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedTask" ADD CONSTRAINT "AssignedTask_assignerId_fkey" FOREIGN KEY ("assignerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedTask" ADD CONSTRAINT "AssignedTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AssignedTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_personalTaskId_fkey" FOREIGN KEY ("personalTaskId") REFERENCES "PersonalTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_assignedTaskId_fkey" FOREIGN KEY ("assignedTaskId") REFERENCES "AssignedTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_personalTaskId_fkey" FOREIGN KEY ("personalTaskId") REFERENCES "PersonalTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_assignedTaskId_fkey" FOREIGN KEY ("assignedTaskId") REFERENCES "AssignedTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAttachment" ADD CONSTRAINT "AIAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIDraft" ADD CONSTRAINT "AIDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContextReference" ADD CONSTRAINT "AIContextReference_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIActionPreview" ADD CONSTRAINT "AIActionPreview_conversationId_actorId_fkey" FOREIGN KEY ("conversationId", "actorId") REFERENCES "AIConversation"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIActionPreview" ADD CONSTRAINT "AIActionPreview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIActionConfirmation" ADD CONSTRAINT "AIActionConfirmation_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIActionConfirmation" ADD CONSTRAINT "AIActionConfirmation_previewId_confirmedById_fkey" FOREIGN KEY ("previewId", "confirmedById") REFERENCES "AIActionPreview"("id", "actorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIActionConfirmation" ADD CONSTRAINT "AIActionConfirmation_operationId_confirmedById_fkey" FOREIGN KEY ("operationId", "confirmedById") REFERENCES "IdempotencyOperation"("id", "actorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIReport" ADD CONSTRAINT "AIReport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIReport" ADD CONSTRAINT "AIReport_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIFeedback" ADD CONSTRAINT "AIFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIFeedback" ADD CONSTRAINT "AIFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AIMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerOpportunity" ADD CONSTRAINT "CareerOpportunity_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CareerCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyOperation" ADD CONSTRAINT "IdempotencyOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Digital Campus PostgreSQL 17 integrity constraints not represented directly
-- by the Prisma schema.

-- RULE-01: all published and draft grade/result values use the 0–100 scale.
ALTER TABLE "GradeRevision"
    ADD CONSTRAINT "GradeRevision_score_range_ck"
    CHECK ("score" BETWEEN 0 AND 100);

ALTER TABLE "TestAnswer"
    ADD CONSTRAINT "TestAnswer_score_range_ck"
    CHECK ("score" IS NULL OR "score" BETWEEN 0 AND 100);

-- A lesson must have a positive time interval.
ALTER TABLE "Lesson"
    ADD CONSTRAINT "Lesson_positive_duration_ck"
    CHECK ("endsAt" > "startsAt");

-- A publication version belongs to exactly one publishable object.
ALTER TABLE "PublicationVersion"
    ADD CONSTRAINT "PublicationVersion_exactly_one_owner_ck"
    CHECK (num_nonnulls("materialId", "homeworkId", "testId") = 1);

-- Only one escalation may remain open for a request at a time.
CREATE UNIQUE INDEX "Escalation_one_open_per_request_uq"
    ON "Escalation" ("requestId")
    WHERE "closedAt" IS NULL;

-- Keep each production-calendar day in the year of its parent calendar.
-- A trigger is required because Prisma's current model has no duplicated year
-- column that could participate in a declarative composite foreign key.
CREATE FUNCTION "check_production_calendar_day_year"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    calendar_year INTEGER;
BEGIN
    SELECT "year"
      INTO calendar_year
      FROM "ProductionCalendarYear"
     WHERE "id" = NEW."calendarId"
     FOR UPDATE;

    IF calendar_year IS NULL THEN
        RAISE EXCEPTION 'Production calendar % does not exist', NEW."calendarId"
            USING ERRCODE = '23503';
    END IF;

    IF EXTRACT(YEAR FROM NEW."date")::INTEGER <> calendar_year THEN
        RAISE EXCEPTION 'Production calendar day % does not belong to calendar year %',
            NEW."date", calendar_year
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "ProductionCalendarDay_year_match_trg"
    BEFORE INSERT OR UPDATE OF "calendarId", "date"
    ON "ProductionCalendarDay"
    FOR EACH ROW
    EXECUTE FUNCTION "check_production_calendar_day_year"();

CREATE FUNCTION "check_production_calendar_year_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."year" <> OLD."year" AND EXISTS (
        SELECT 1
          FROM "ProductionCalendarDay" AS day
         WHERE day."calendarId" = OLD."id"
           AND EXTRACT(YEAR FROM day."date")::INTEGER <> NEW."year"
    ) THEN
        RAISE EXCEPTION 'Calendar year % would not match its stored dates', NEW."year"
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "ProductionCalendarYear_year_match_trg"
    BEFORE UPDATE OF "year"
    ON "ProductionCalendarYear"
    FOR EACH ROW
    EXECUTE FUNCTION "check_production_calendar_year_update"();

-- Prevent overlapping scheduled lessons for the same group, teacher, or room.
-- Pending schedule proposals are not stored as active Lesson rows and are
-- checked by the server again in the approval transaction.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Lesson"
    ADD CONSTRAINT "Lesson_group_no_overlap_excl"
    EXCLUDE USING gist (
        "groupId" WITH =,
        tstzrange("startsAt", "endsAt", '[)') WITH &&
    )
    WHERE ("state" = 'SCHEDULED');

ALTER TABLE "Lesson"
    ADD CONSTRAINT "Lesson_teacher_no_overlap_excl"
    EXCLUDE USING gist (
        "teacherId" WITH =,
        tstzrange("startsAt", "endsAt", '[)') WITH &&
    )
    WHERE ("state" = 'SCHEDULED');

ALTER TABLE "Lesson"
    ADD CONSTRAINT "Lesson_room_no_overlap_excl"
    EXCLUDE USING gist (
        "roomId" WITH =,
        tstzrange("startsAt", "endsAt", '[)') WITH &&
    )
    WHERE ("state" = 'SCHEDULED' AND "roomId" IS NOT NULL);
