-- Retire the application login role; church member records and group positions are unchanged.
BEGIN;

-- Preserve existing staff access on mixed-role profiles. Do not promote member-only accounts.
UPDATE "profiles"
SET "role" = array_remove("role", 'member'),
    "status" = CASE WHEN cardinality(array_remove("role", 'member')) = 0
                    THEN 'inactive' ELSE "status" END,
    "updated_at" = CURRENT_TIMESTAMP
WHERE 'member' = ANY("role");

ALTER TABLE "profiles" ALTER COLUMN "role" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_no_member_login_role";
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_no_member_login_role"
  CHECK (NOT ('member' = ANY("role")));

DELETE FROM "role_permissions" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'member');
DELETE FROM "church_role_permissions" WHERE "role_name" = 'member';
DELETE FROM "roles" WHERE "name" = 'member';

-- Prevent stale clients, seeds or custom-role creation from restoring the retired role.
ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_no_member_login_role";
ALTER TABLE "roles" ADD CONSTRAINT "roles_no_member_login_role" CHECK ("name" <> 'member');
ALTER TABLE "church_role_permissions" DROP CONSTRAINT IF EXISTS "church_role_permissions_no_member_login_role";
ALTER TABLE "church_role_permissions" ADD CONSTRAINT "church_role_permissions_no_member_login_role"
  CHECK ("role_name" <> 'member');

COMMIT;
