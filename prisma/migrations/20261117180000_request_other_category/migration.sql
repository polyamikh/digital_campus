-- Additive request category. Existing request rows and their SLA values are untouched.
BEGIN;

ALTER TYPE "ServiceRequestCategory" ADD VALUE IF NOT EXISTS 'OTHER';

-- Keep the existing category/SLA mapping and add the agreed five-working-day SLA.
-- Cast the enum to text so the new enum label is not used before commit.
ALTER TABLE "ServiceRequest"
    ADD CONSTRAINT "ServiceRequest_category_sla_ck_new"
    CHECK (
        ("category"::text IN ('STUDY_CERTIFICATE', 'STUDY_PERIOD_CERTIFICATE', 'GRADE_TRANSCRIPT') AND "slaWorkingDays" = 3)
        OR ("category"::text IN ('ACADEMIC_QUESTION', 'PERSONAL_DATA_CORRECTION', 'OTHER') AND "slaWorkingDays" = 5)
    ) NOT VALID;

ALTER TABLE "ServiceRequest"
    VALIDATE CONSTRAINT "ServiceRequest_category_sla_ck_new";

ALTER TABLE "ServiceRequest"
    DROP CONSTRAINT "ServiceRequest_category_sla_ck";

ALTER TABLE "ServiceRequest"
    RENAME CONSTRAINT "ServiceRequest_category_sla_ck_new" TO "ServiceRequest_category_sla_ck";

COMMIT;
