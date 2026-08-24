-- Transactions: optional linkage to the service or event a gift was recorded against
ALTER TABLE "transactions" ADD COLUMN "service_id" TEXT;
ALTER TABLE "transactions" ADD COLUMN "event_id" TEXT;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "transactions_church_id_service_id_idx" ON "transactions"("church_id", "service_id");
