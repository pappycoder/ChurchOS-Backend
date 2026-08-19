/*
  Warnings:

  - You are about to drop the `attendance_archive` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `messages_archive` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "recurring_giving" ALTER COLUMN "paused_at" SET DATA TYPE TIMESTAMP(3);

-- DropTable
DROP TABLE "attendance_archive";

-- DropTable
DROP TABLE "messages_archive";

-- CreateTable
CREATE TABLE "sermon_bookmarks" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "sermon_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sermon_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cell_group_members" (
    "id" TEXT NOT NULL,
    "cell_group_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cell_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cell_group_attendance" (
    "id" TEXT NOT NULL,
    "cell_group_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "meeting_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'present',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cell_group_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sermon_bookmarks_member_id_idx" ON "sermon_bookmarks"("member_id");

-- CreateIndex
CREATE INDEX "sermon_bookmarks_sermon_id_idx" ON "sermon_bookmarks"("sermon_id");

-- CreateIndex
CREATE UNIQUE INDEX "sermon_bookmarks_member_id_sermon_id_key" ON "sermon_bookmarks"("member_id", "sermon_id");

-- CreateIndex
CREATE INDEX "cell_group_members_cell_group_id_idx" ON "cell_group_members"("cell_group_id");

-- CreateIndex
CREATE INDEX "cell_group_members_member_id_idx" ON "cell_group_members"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "cell_group_members_cell_group_id_member_id_key" ON "cell_group_members"("cell_group_id", "member_id");

-- CreateIndex
CREATE INDEX "cell_group_attendance_cell_group_id_idx" ON "cell_group_attendance"("cell_group_id");

-- CreateIndex
CREATE INDEX "cell_group_attendance_cell_group_id_meeting_date_idx" ON "cell_group_attendance"("cell_group_id", "meeting_date");

-- CreateIndex
CREATE UNIQUE INDEX "cell_group_attendance_cell_group_id_member_id_meeting_date_key" ON "cell_group_attendance"("cell_group_id", "member_id", "meeting_date");

-- AddForeignKey
ALTER TABLE "sermon_bookmarks" ADD CONSTRAINT "sermon_bookmarks_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermon_bookmarks" ADD CONSTRAINT "sermon_bookmarks_sermon_id_fkey" FOREIGN KEY ("sermon_id") REFERENCES "sermons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cell_group_members" ADD CONSTRAINT "cell_group_members_cell_group_id_fkey" FOREIGN KEY ("cell_group_id") REFERENCES "cell_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cell_group_members" ADD CONSTRAINT "cell_group_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cell_group_attendance" ADD CONSTRAINT "cell_group_attendance_cell_group_id_fkey" FOREIGN KEY ("cell_group_id") REFERENCES "cell_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cell_group_attendance" ADD CONSTRAINT "cell_group_attendance_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
