-- Rename the secretary_id column to person_id (preserving existing data)
ALTER TABLE "appointments" RENAME COLUMN "secretary_id" TO "person_id";

-- Add the nullable visitor Who-party column
ALTER TABLE "appointments" ADD COLUMN "visitor_id" TEXT;

-- DropIndex
DROP INDEX "appointments_secretary_id_idx";

-- CreateIndex
CREATE INDEX "appointments_person_id_idx" ON "appointments"("person_id");

-- CreateIndex
CREATE INDEX "appointments_visitor_id_idx" ON "appointments"("visitor_id");
