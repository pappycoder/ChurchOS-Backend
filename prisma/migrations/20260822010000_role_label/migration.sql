-- Per-church custom roles: persist the human-friendly label.
-- The create-role flow slugifies the label into `name`; without this column
-- the original casing ("Media Team") was lost and UIs fell back to the slug.

ALTER TABLE "roles" ADD COLUMN "label" TEXT;

-- Backfill global templates with their canonical labels.
UPDATE "roles" SET "label" = 'Super Admin' WHERE "church_id" IS NULL AND "name" = 'super_admin';
UPDATE "roles" SET "label" = 'Senior Pastor' WHERE "church_id" IS NULL AND "name" = 'senior_pastor';
UPDATE "roles" SET "label" = 'Church Admin' WHERE "church_id" IS NULL AND "name" = 'church_admin';
UPDATE "roles" SET "label" = 'Branch Pastor' WHERE "church_id" IS NULL AND "name" = 'branch_pastor';
UPDATE "roles" SET "label" = 'Secretary' WHERE "church_id" IS NULL AND "name" = 'secretary';
UPDATE "roles" SET "label" = 'Treasurer' WHERE "church_id" IS NULL AND "name" = 'treasurer';
UPDATE "roles" SET "label" = 'Department Head' WHERE "church_id" IS NULL AND "name" = 'department_head';
UPDATE "roles" SET "label" = 'Member' WHERE "church_id" IS NULL AND "name" = 'member';

-- Best-effort backfill for church-owned roles created before this change:
-- title-case the slug (media_team → Media Team).
UPDATE "roles"
SET "label" = initcap(replace("name", '_', ' '))
WHERE "church_id" IS NOT NULL AND "label" IS NULL;
