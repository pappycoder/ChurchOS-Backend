BEGIN;

LOCK TABLE "giving_categories" IN ACCESS EXCLUSIVE MODE;

-- Fail before changing data if existing names need review. Never merge financial
-- history or silently rename categories to make a uniqueness migration pass.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "giving_categories"
    GROUP BY church_id, lower(regexp_replace(name, '^\s+|\s+$', '', 'g'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate giving category names exist within a church. Review and rename duplicates, including archived categories, before retrying this migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM "giving_categories" WHERE name !~ '\S') THEN
    RAISE EXCEPTION 'Blank giving category names exist. Rename them before retrying this migration.';
  END IF;
END $$;

UPDATE "giving_categories"
SET branch_id = NULL,
    name = regexp_replace(name, '^\s+|\s+$', '', 'g'),
    updated_at = CURRENT_TIMESTAMP
WHERE branch_id IS NOT NULL OR name <> regexp_replace(name, '^\s+|\s+$', '', 'g');

-- Expression index includes archived categories and closes concurrent-write races.
CREATE UNIQUE INDEX "giving_categories_church_name_key"
ON "giving_categories" (church_id, lower(regexp_replace(name, '^\s+|\s+$', '', 'g')));

ALTER TABLE "giving_categories"
  ADD CONSTRAINT "giving_categories_church_wide_check" CHECK (branch_id IS NULL),
  ADD CONSTRAINT "giving_categories_name_not_blank_check" CHECK (name ~ '\S');

COMMIT;
