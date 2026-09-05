-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('reserved', 'paid', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "RegistrationPaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_category_id_fkey";

-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "checked_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checked_in_at" TIMESTAMP(3),
ADD COLUMN     "payment_reference" TEXT,
ADD COLUMN     "payment_status" "RegistrationPaymentStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ticket_id" TEXT,
ADD COLUMN     "tier_id" TEXT,
ADD COLUMN     "transaction_id" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "fallback_channel" TEXT,
ADD COLUMN     "parent_message_id" TEXT;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "payment_reference" TEXT,
ADD COLUMN     "price_paid" DOUBLE PRECISION,
ADD COLUMN     "registration_id" TEXT,
ADD COLUMN     "status" "TicketStatus" NOT NULL DEFAULT 'reserved',
ADD COLUMN     "tier_name" TEXT,
ADD COLUMN     "transaction_id" TEXT;

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "category_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "event_ticket_tiers" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_ticket_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_ticket_tiers_event_id_idx" ON "event_ticket_tiers"("event_id");

-- CreateIndex
CREATE INDEX "messages_parent_message_id_idx" ON "messages"("parent_message_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "giving_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ticket_tiers" ADD CONSTRAINT "event_ticket_tiers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
