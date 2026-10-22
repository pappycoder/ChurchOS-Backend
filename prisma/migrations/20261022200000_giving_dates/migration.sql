-- Preserve entry timestamps while separating the calendar day the gift belongs to.
ALTER TABLE "transactions" ADD COLUMN "giving_date" DATE;
UPDATE "transactions" SET "giving_date" = "created_at"::date;
ALTER TABLE "transactions" ALTER COLUMN "giving_date" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "giving_date" SET NOT NULL;
CREATE INDEX "transactions_church_id_branch_id_giving_date_idx" ON "transactions"("church_id", "branch_id", "giving_date");
CREATE INDEX "transactions_church_id_member_id_giving_date_idx" ON "transactions"("church_id", "member_id", "giving_date");
