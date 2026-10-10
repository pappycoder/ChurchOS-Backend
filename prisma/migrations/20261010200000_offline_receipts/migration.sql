CREATE TABLE "offline_receipts" (
  "id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "mutation_id" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offline_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "offline_receipts_church_id_profile_id_mutation_id_key"
ON "offline_receipts"("church_id", "profile_id", "mutation_id");
