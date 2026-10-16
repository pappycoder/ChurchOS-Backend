CREATE TABLE "messaging_integrations" (
 "church_id" TEXT NOT NULL REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "provider" TEXT NOT NULL CHECK ("provider" IN ('resend', 'termii')),
 "mode" TEXT NOT NULL CHECK ("mode" IN ('platform', 'custom', 'disabled')),
 "ciphertext" TEXT,
 "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("church_id", "provider"),
 CHECK (("mode" = 'custom' AND "ciphertext" IS NOT NULL) OR ("mode" <> 'custom' AND "ciphertext" IS NULL))
);
ALTER TABLE "messaging_integrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "messaging_integrations" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
  REVOKE ALL ON TABLE "messaging_integrations" FROM anon;
 END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
  REVOKE ALL ON TABLE "messaging_integrations" FROM authenticated;
 END IF;
END $$;
