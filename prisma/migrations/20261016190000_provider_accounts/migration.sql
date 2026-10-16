CREATE TABLE "integration_accounts" (
 "id" TEXT PRIMARY KEY,
 "church_id" TEXT NOT NULL REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "provider" TEXT NOT NULL CHECK ("provider" IN ('resend','sendgrid','mailgun','termii','twilio','meta','paystack','flutterwave')),
 "label" TEXT NOT NULL,
 "ciphertext" TEXT NOT NULL,
 "verification_status" TEXT NOT NULL DEFAULT 'unchecked' CHECK ("verification_status" IN ('unchecked','verified','limited','rejected')),
 "verified_at" TIMESTAMP(3), "archived_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "integration_accounts_church_id_provider_idx" ON "integration_accounts"("church_id", "provider");
CREATE TABLE "integration_channels" (
 "church_id" TEXT NOT NULL REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "channel" TEXT NOT NULL CHECK ("channel" IN ('email','whatsapp','sms','voice','payment')),
 "mode" TEXT NOT NULL CHECK ("mode" IN ('platform','custom','disabled')),
 "provider" TEXT,
 "account_id" TEXT REFERENCES "integration_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "settings" JSONB NOT NULL DEFAULT '{}', "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("church_id", "channel"),
 CHECK (("mode" = 'custom' AND "account_id" IS NOT NULL AND "provider" IS NOT NULL) OR ("mode" <> 'custom' AND "account_id" IS NULL))
);
ALTER TABLE "transactions" ADD COLUMN "integration_account_id" TEXT REFERENCES "integration_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_giving" ADD COLUMN "integration_account_id" TEXT REFERENCES "integration_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_channels" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "integration_accounts", "integration_channels" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "integration_accounts", "integration_channels" FROM anon; END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "integration_accounts", "integration_channels" FROM authenticated; END IF;
END $$;
