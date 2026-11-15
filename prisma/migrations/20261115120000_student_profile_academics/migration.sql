-- Add profile data without rewriting or deleting existing application records.
CREATE TABLE "StudentAcademicProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "studentNumber" VARCHAR(80),
    "admissionYear" INTEGER,
    "academicStatus" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentAcademicProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademicProgram" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80),
    "name" VARCHAR(200),
    "instituteName" VARCHAR(200),
    "facultyName" VARCHAR(200),
    "directionName" VARCHAR(200),
    "studyMode" VARCHAR(80),
    CONSTRAINT "AcademicProgram_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Group" ADD COLUMN "academicProgramId" UUID;

CREATE UNIQUE INDEX "StudentAcademicProfile_userId_key" ON "StudentAcademicProfile"("userId");
CREATE UNIQUE INDEX "StudentAcademicProfile_studentNumber_key" ON "StudentAcademicProfile"("studentNumber");
CREATE INDEX "StudentAcademicProfile_admissionYear_idx" ON "StudentAcademicProfile"("admissionYear");
CREATE UNIQUE INDEX "AcademicProgram_code_key" ON "AcademicProgram"("code");
CREATE INDEX "Group_academicProgramId_idx" ON "Group"("academicProgramId");

ALTER TABLE "StudentAcademicProfile"
    ADD CONSTRAINT "StudentAcademicProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Group"
    ADD CONSTRAINT "Group_academicProgramId_fkey"
    FOREIGN KEY ("academicProgramId") REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
