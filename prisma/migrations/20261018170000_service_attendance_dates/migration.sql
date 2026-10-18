-- A recurring service can have many dated occurrences for the same member.
ALTER TABLE "attendance" ADD COLUMN "attendance_date" DATE;
UPDATE "attendance" SET "attendance_date" = "checkin_at"::date;
ALTER TABLE "attendance" ALTER COLUMN "attendance_date" SET DEFAULT CURRENT_DATE;
ALTER TABLE "attendance" ALTER COLUMN "attendance_date" SET NOT NULL;
DROP INDEX "attendance_service_id_member_id_key";
CREATE UNIQUE INDEX "attendance_service_id_member_id_attendance_date_key" ON "attendance"("service_id","member_id","attendance_date");
-- The dated unique index enforces duplicates atomically. Remove the older
-- trigger that incorrectly rejected every later occurrence of a service.
DROP TRIGGER IF EXISTS "check_duplicate_attendance" ON "attendance";
DROP FUNCTION IF EXISTS prevent_duplicate_attendance();
