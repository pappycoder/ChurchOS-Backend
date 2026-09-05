-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "category" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "external_status" TEXT,
ADD COLUMN     "variables" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "audience_filter" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_recipients" (
    "id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "member_id" TEXT,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcasts_church_id_status_idx" ON "broadcasts"("church_id", "status");

-- CreateIndex
CREATE INDEX "broadcasts_church_id_scheduled_at_idx" ON "broadcasts"("church_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "broadcast_recipients_broadcast_id_idx" ON "broadcast_recipients"("broadcast_id");

-- CreateIndex
CREATE INDEX "broadcast_recipients_broadcast_id_status_idx" ON "broadcast_recipients"("broadcast_id", "status");

-- CreateIndex
CREATE INDEX "templates_church_id_channel_status_idx" ON "templates"("church_id", "channel", "status");

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
