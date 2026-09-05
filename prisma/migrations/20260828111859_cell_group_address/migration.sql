-- DropForeignKey
ALTER TABLE "cell_group_attendance" DROP CONSTRAINT "cell_group_attendance_member_id_fkey";

-- AddForeignKey
ALTER TABLE "cell_group_attendance" ADD CONSTRAINT "cell_group_attendance_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
