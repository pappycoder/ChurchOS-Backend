-- DropForeignKey
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_service_id_fkey";

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "visitor_id" TEXT;

-- CreateIndex
CREATE INDEX "tickets_visitor_id_idx" ON "tickets"("visitor_id");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
