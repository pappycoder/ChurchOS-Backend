-- AlterTable: cell groups gain an optional branch scope
ALTER TABLE "cell_groups" ADD COLUMN "branch_id" TEXT;

-- AddForeignKey
ALTER TABLE "cell_groups" ADD CONSTRAINT "cell_groups_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: branch scoping for cell groups
CREATE INDEX "cell_groups_church_id_branch_id_idx" ON "cell_groups"("church_id", "branch_id");

-- AlterTable: attendance records may link a member or a visitor
ALTER TABLE "cell_group_attendance" ALTER COLUMN "member_id" DROP NOT NULL;
ALTER TABLE "cell_group_attendance" ADD COLUMN "visitor_id" TEXT;
ALTER TABLE "cell_group_attendance" ADD COLUMN "visitor_name" TEXT;

-- Ensure at least one of member_id, visitor_id, or a free-text visitor_name is provided
ALTER TABLE "cell_group_attendance" ADD CONSTRAINT "cell_group_attendance_member_or_visitor_check"
  CHECK ("member_id" IS NOT NULL OR "visitor_id" IS NOT NULL OR "visitor_name" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "cell_group_attendance" ADD CONSTRAINT "cell_group_attendance_visitor_id_fkey"
  FOREIGN KEY ("visitor_id") REFERENCES "visitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: visitor attendance dedup (one record per group per visitor per meeting date)
CREATE UNIQUE INDEX "cell_group_attendance_cell_group_id_visitor_id_meeting_date_key"
  ON "cell_group_attendance"("cell_group_id", "visitor_id", "meeting_date");

-- CreateIndex: visitor attendance query performance
CREATE INDEX "cell_group_attendance_cell_group_id_visitor_id_idx"
  ON "cell_group_attendance"("cell_group_id", "visitor_id");