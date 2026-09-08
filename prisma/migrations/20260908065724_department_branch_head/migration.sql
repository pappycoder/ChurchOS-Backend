-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "branch_id" TEXT,
ADD COLUMN     "head_member_id" TEXT;

-- CreateIndex
CREATE INDEX "departments_church_id_branch_id_idx" ON "departments"("church_id", "branch_id");

-- CreateIndex
CREATE INDEX "departments_head_member_id_idx" ON "departments"("head_member_id");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
