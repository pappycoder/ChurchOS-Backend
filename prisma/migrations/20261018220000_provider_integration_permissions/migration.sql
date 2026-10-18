-- Migration-only installations must have the catalog entries used by the UI/API.
-- Additive and idempotent; integration eligibility remains centrally admin-only.
BEGIN;
INSERT INTO "permissions" ("id", "name", "resource", "action")
SELECT gen_random_uuid()::text, 'integrations:' || grant_action, 'integrations', grant_action
FROM unnest(ARRAY['view', 'create', 'read', 'update', 'delete']) AS grant_action
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid()::text, r.id, p.id
FROM "roles" r CROSS JOIN "permissions" p
WHERE r.church_id IS NULL
  AND r.name IN ('church_admin', 'super_admin')
  AND p.resource = 'integrations'
  AND p.action IN ('view', 'create', 'read', 'update', 'delete')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
COMMIT;
