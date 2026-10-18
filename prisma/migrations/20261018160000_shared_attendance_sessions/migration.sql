-- Generalize service headcounts into one shared session model, preserving all existing rows.
ALTER TABLE "general_attendance" RENAME TO "attendance_sessions";
ALTER TABLE "attendance_sessions" RENAME CONSTRAINT "general_attendance_pkey" TO "attendance_sessions_pkey";
ALTER TABLE "attendance_sessions" RENAME CONSTRAINT "general_attendance_church_id_fkey" TO "attendance_sessions_church_id_fkey";
ALTER TABLE "attendance_sessions" RENAME CONSTRAINT "general_attendance_branch_id_fkey" TO "attendance_sessions_branch_id_fkey";
ALTER TABLE "attendance_sessions" RENAME CONSTRAINT "general_attendance_service_id_fkey" TO "attendance_sessions_service_id_fkey";
ALTER INDEX "general_attendance_service_id_branch_id_attendance_date_key" RENAME TO "attendance_sessions_service_id_branch_id_attendance_date_key";
ALTER INDEX "general_attendance_church_id_branch_id_attendance_date_idx" RENAME TO "attendance_sessions_church_id_branch_id_attendance_date_idx";
DROP INDEX "general_attendance_service_id_attendance_date_idx";
ALTER TABLE "attendance_sessions" ALTER COLUMN "service_id" DROP NOT NULL;
ALTER TABLE "attendance_sessions" ADD COLUMN "event_id" TEXT REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "attendance_sessions_event_id_branch_id_attendance_date_key" ON "attendance_sessions"("event_id","branch_id","attendance_date");
ALTER TABLE "attendance_sessions" ADD COLUMN "department_id" TEXT REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "attendance_sessions_department_id_branch_id_attendance_date_key" ON "attendance_sessions"("department_id","branch_id","attendance_date");
ALTER TABLE "attendance_sessions" ADD COLUMN "cell_group_id" TEXT REFERENCES "cell_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "attendance_sessions_cell_group_id_branch_id_attendance_date_key" ON "attendance_sessions"("cell_group_id","branch_id","attendance_date");
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_one_context_check" CHECK (num_nonnulls("service_id","event_id","department_id","cell_group_id")=1);
CREATE INDEX "attendance_sessions_church_id_attendance_date_idx" ON "attendance_sessions"("church_id","attendance_date");
ALTER TABLE "attendance" ADD COLUMN "session_id" TEXT REFERENCES "attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "attendance_session_id_idx" ON "attendance"("session_id");
ALTER TABLE "department_attendance" ADD COLUMN "session_id" TEXT REFERENCES "attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "department_attendance_session_id_idx" ON "department_attendance"("session_id");
ALTER TABLE "cell_group_attendance" ADD COLUMN "session_id" TEXT REFERENCES "attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "cell_group_attendance_session_id_idx" ON "cell_group_attendance"("session_id");
-- Attach existing service check-ins only when the branch can be determined safely.
UPDATE "attendance" a SET "session_id" = s.id
FROM "attendance_sessions" s, "services" parent
WHERE s.service_id = parent.id AND a.service_id = parent.id AND a.church_id = s.church_id
AND a.checkin_at::date = s.attendance_date AND a.session_id IS NULL
AND s.branch_id = COALESCE(parent.branch_id,
 (SELECT m.branch_id FROM members m WHERE m.id=a.member_id AND m.church_id=a.church_id),
 (SELECT v.branch_id FROM visitors v WHERE v.id=a.visitor_id AND v.church_id=a.church_id));
-- RLS and revoked browser grants carry over on table rename.
