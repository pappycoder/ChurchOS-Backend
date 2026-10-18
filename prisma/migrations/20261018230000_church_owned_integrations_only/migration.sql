-- Environment provider keys belong to ChurchOS, never an unconfigured tenant.
-- Keep historical transaction merchant references and encrypted accounts intact.
BEGIN;
UPDATE "integration_channels"
SET "mode" = 'disabled', "provider" = NULL, "account_id" = NULL,
    "settings" = '{}', "updated_at" = CURRENT_TIMESTAMP
WHERE "mode" = 'platform';
UPDATE "messaging_integrations"
SET "mode" = 'disabled', "updated_at" = CURRENT_TIMESTAMP
WHERE "mode" = 'platform';
ALTER TABLE "integration_channels" ALTER COLUMN "mode" SET DEFAULT 'disabled';
ALTER TABLE "messaging_integrations" ALTER COLUMN "mode" SET DEFAULT 'disabled';
ALTER TABLE "integration_channels" DROP CONSTRAINT IF EXISTS "integration_channels_mode_check";
ALTER TABLE "integration_channels" DROP CONSTRAINT IF EXISTS "integration_channels_church_mode_check";
ALTER TABLE "integration_channels" ADD CONSTRAINT "integration_channels_church_mode_check" CHECK ("mode" IN ('custom', 'disabled'));
ALTER TABLE "messaging_integrations" DROP CONSTRAINT IF EXISTS "messaging_integrations_mode_check";
ALTER TABLE "messaging_integrations" DROP CONSTRAINT IF EXISTS "messaging_integrations_church_mode_check";
ALTER TABLE "messaging_integrations" ADD CONSTRAINT "messaging_integrations_church_mode_check" CHECK ("mode" IN ('custom', 'disabled'));
COMMIT;
