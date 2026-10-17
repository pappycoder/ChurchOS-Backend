CREATE TABLE "department_attendance" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "department_id" TEXT NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "member_id" TEXT REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "visitor_name" TEXT,
 "meeting_date" DATE NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'present' CHECK ("status" IN ('present','late','absent','excused')),
 "notes" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("member_id" IS NOT NULL OR COALESCE(length(trim("visitor_name")), 0) > 0)
);
CREATE UNIQUE INDEX "department_attendance_department_id_member_id_meeting_date_key" ON "department_attendance"("department_id", "member_id", "meeting_date");
CREATE INDEX "department_attendance_department_id_meeting_date_idx" ON "department_attendance"("department_id", "meeting_date");
ALTER TABLE "department_attendance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "department_attendance" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "department_attendance" FROM anon; END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "department_attendance" FROM authenticated; END IF;
END $$;
