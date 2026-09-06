-- Visitors: optional linkage to the branch a visitor was first received in
ALTER TABLE "visitors" ADD COLUMN "branch_id" TEXT;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "visitors_branch_id_idx" ON "visitors"("branch_id");