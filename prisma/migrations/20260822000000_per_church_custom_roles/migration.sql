-- Per-church custom roles: Role.church_id (null = global template).
-- A church-owned role shadows the global template of the same name.

ALTER TABLE "roles" ADD COLUMN "church_id" TEXT;

-- Drop global name uniqueness; scope uniqueness per church instead.
-- (NULL church_id rows are exempt from this constraint in Postgres,
-- so global template names stay unique via seed/app-layer enforcement.)
DROP INDEX "roles_name_key";

CREATE INDEX "roles_church_id_idx" ON "roles"("church_id");

CREATE UNIQUE INDEX "roles_church_id_name_key" ON "roles"("church_id", "name");

ALTER TABLE "roles" ADD CONSTRAINT "roles_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON UPDATE CASCADE ON DELETE CASCADE;
