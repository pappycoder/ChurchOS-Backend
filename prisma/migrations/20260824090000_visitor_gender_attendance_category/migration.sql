-- Visitors: gender + custom fields
ALTER TABLE "visitors" ADD COLUMN "gender" TEXT;
ALTER TABLE "visitors" ADD COLUMN "custom_fields" JSONB NOT NULL DEFAULT '{}';

-- Services: adult/children category (default for check-ins)
ALTER TABLE "services" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'adult';
ALTER TABLE "services" ADD CONSTRAINT "services_category_check" CHECK ("category" IN ('adult', 'children'));

-- Attendance: link to visitor records + per-record category
ALTER TABLE "attendance" ADD COLUMN "visitor_id" UUID;
ALTER TABLE "attendance" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'adult';
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_category_check" CHECK ("category" IN ('adult', 'children'));
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "attendance_church_id_visitor_id_idx" ON "attendance"("church_id", "visitor_id");
