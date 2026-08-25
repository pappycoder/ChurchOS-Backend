-- AlterTable: make service_id nullable, add event_id
ALTER TABLE "attendance" ALTER COLUMN "service_id" DROP NOT NULL;
ALTER TABLE "attendance" ADD COLUMN "event_id" TEXT;

-- Ensure at least one of service_id or event_id is provided
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_service_or_event_check"
  CHECK ("service_id" IS NOT NULL OR "event_id" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: event attendance dedup (one check-in per event per member)
CREATE UNIQUE INDEX "attendance_event_id_member_id_key" ON "attendance"("event_id", "member_id");

-- CreateIndex: event attendance query performance
CREATE INDEX "attendance_church_id_event_id_checkin_at_idx" ON "attendance"("church_id", "event_id", "checkin_at");
