ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_category_check";
ALTER TABLE "services" ADD CONSTRAINT "services_category_check" CHECK ("category" IN ('adult','children','mixed'));
ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_category_check";
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_category_check" CHECK ("category" IN ('adult','children','unspecified'));

CREATE TABLE "general_attendance" (
 "id" TEXT PRIMARY KEY, "church_id" TEXT NOT NULL REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "service_id" TEXT NOT NULL REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "attendance_date" DATE NOT NULL, "total" INTEGER NOT NULL CHECK ("total" >= 0),
 "adult_count" INTEGER CHECK ("adult_count" >= 0), "children_count" INTEGER CHECK ("children_count" >= 0),
 "male_count" INTEGER CHECK ("male_count" >= 0), "female_count" INTEGER CHECK ("female_count" >= 0),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CHECK (COALESCE("adult_count",0)::bigint + COALESCE("children_count",0)::bigint <= "total"),
 CHECK (COALESCE("male_count",0)::bigint + COALESCE("female_count",0)::bigint <= "total")
);
CREATE UNIQUE INDEX "general_attendance_service_id_branch_id_attendance_date_key" ON "general_attendance"("service_id","branch_id","attendance_date");
CREATE INDEX "general_attendance_church_id_branch_id_attendance_date_idx" ON "general_attendance"("church_id","branch_id","attendance_date");
CREATE INDEX "general_attendance_service_id_attendance_date_idx" ON "general_attendance"("service_id","attendance_date");
ALTER TABLE "general_attendance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "general_attendance" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "general_attendance" FROM anon; END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "general_attendance" FROM authenticated; END IF;
END $$;
