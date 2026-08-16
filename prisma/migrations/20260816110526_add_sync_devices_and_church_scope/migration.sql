-- Backfill: add church_id as nullable, populate from the parent relation,
-- then enforce NOT NULL (safe for both empty and populated tables).

-- event_registrations ← events.church_id
ALTER TABLE "event_registrations" ADD COLUMN "church_id" TEXT;

UPDATE "event_registrations" er
SET "church_id" = e."church_id"
FROM "events" e
WHERE er."event_id" = e."id";

ALTER TABLE "event_registrations" ALTER COLUMN "church_id" SET NOT NULL;

-- sermon_bookmarks ← members.church_id
ALTER TABLE "sermon_bookmarks" ADD COLUMN "church_id" TEXT;

UPDATE "sermon_bookmarks" sb
SET "church_id" = m."church_id"
FROM "members" m
WHERE sb."member_id" = m."id";

ALTER TABLE "sermon_bookmarks" ALTER COLUMN "church_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "sync_devices" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "last_pull_cursor" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_devices_church_id_last_pull_cursor_idx" ON "sync_devices"("church_id", "last_pull_cursor");

-- CreateIndex
CREATE UNIQUE INDEX "sync_devices_church_id_device_id_key" ON "sync_devices"("church_id", "device_id");

-- CreateIndex
CREATE INDEX "event_registrations_church_id_event_id_idx" ON "event_registrations"("church_id", "event_id");

-- CreateIndex
CREATE INDEX "sermon_bookmarks_church_id_member_id_idx" ON "sermon_bookmarks"("church_id", "member_id");
