-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "secretary_id" TEXT NOT NULL,
    "pastor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_church_id_scheduled_at_idx" ON "appointments"("church_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_secretary_id_idx" ON "appointments"("secretary_id");

-- CreateIndex
CREATE INDEX "appointments_pastor_id_idx" ON "appointments"("pastor_id");
