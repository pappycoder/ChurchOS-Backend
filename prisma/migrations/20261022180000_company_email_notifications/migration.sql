ALTER TABLE "subscription_payments" ADD COLUMN "billing_email" TEXT;

CREATE TABLE "company_email_notifications" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "event_key" TEXT NOT NULL,
 "church_id" TEXT NOT NULL REFERENCES "churches"("id") ON DELETE CASCADE,
 "kind" TEXT NOT NULL,
 "to_email" TEXT NOT NULL,
 "from_email" TEXT NOT NULL,
 "subject" TEXT NOT NULL,
 "html" TEXT NOT NULL,
 "text" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending',
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lease_token" TEXT,
 "lease_until" TIMESTAMP(3),
 "first_attempt_at" TIMESTAMP(3),
 "sent_at" TIMESTAMP(3),
 "provider_id" TEXT,
 "last_error" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "company_email_status_check" CHECK ("status" IN ('pending','sending','sent','failed')),
 CONSTRAINT "company_email_kind_check" CHECK ("kind" IN ('welcome','activation','renewal','upgrade')),
 CONSTRAINT "company_email_attempts_check" CHECK ("attempts">=0)
);
CREATE UNIQUE INDEX "company_email_notifications_event_key_key" ON "company_email_notifications"("event_key");
CREATE INDEX "company_email_notifications_status_available_at_idx" ON "company_email_notifications"("status","available_at");
ALTER TABLE "company_email_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "company_email_notifications" FROM anon, authenticated;
