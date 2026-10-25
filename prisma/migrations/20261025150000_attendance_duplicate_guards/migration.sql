-- Do not delete or merge historical attendance. If an index fails because of
-- existing duplicates, reconcile those records before applying this migration.
BEGIN;
CREATE UNIQUE INDEX "attendance_service_id_visitor_id_attendance_date_key"
  ON "attendance"("service_id", "visitor_id", "attendance_date");
CREATE UNIQUE INDEX "attendance_event_id_visitor_id_key"
  ON "attendance"("event_id", "visitor_id");

-- A legacy name-only entry can only be compared by its normalised name.
-- Different people sharing a name must use their distinct visitor records.
CREATE UNIQUE INDEX "attendance_service_anonymous_name_date_key"
  ON "attendance"("church_id", "service_id", "attendance_date",
    lower(regexp_replace(btrim("visitor_name"), '[[:space:]]+', ' ', 'g')))
  WHERE "member_id" IS NULL AND "visitor_id" IS NULL
    AND "visitor_name" IS NOT NULL AND btrim("visitor_name") <> '';
CREATE UNIQUE INDEX "attendance_event_anonymous_name_key"
  ON "attendance"("church_id", "event_id",
    lower(regexp_replace(btrim("visitor_name"), '[[:space:]]+', ' ', 'g')))
  WHERE "member_id" IS NULL AND "visitor_id" IS NULL
    AND "visitor_name" IS NOT NULL AND btrim("visitor_name") <> '';
COMMIT;
