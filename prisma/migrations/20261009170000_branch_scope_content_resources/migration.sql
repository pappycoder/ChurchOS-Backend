-- Add branch ownership to resources that were previously church-wide only.
-- Existing rows remain unassigned and are treated as shared legacy records.

ALTER TABLE "families" ADD COLUMN "branch_id" TEXT;
ALTER TABLE "giving_categories" ADD COLUMN "branch_id" TEXT;
ALTER TABLE "templates" ADD COLUMN "branch_id" TEXT;
ALTER TABLE "sermons" ADD COLUMN "branch_id" TEXT;
ALTER TABLE "media_assets" ADD COLUMN "branch_id" TEXT;
ALTER TABLE "forms" ADD COLUMN "branch_id" TEXT;

ALTER TABLE "families"
  ADD CONSTRAINT "families_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "giving_categories"
  ADD CONSTRAINT "giving_categories_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "templates"
  ADD CONSTRAINT "templates_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sermons"
  ADD CONSTRAINT "sermons_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "forms"
  ADD CONSTRAINT "forms_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "families_church_id_branch_id_idx" ON "families"("church_id", "branch_id");
CREATE INDEX "giving_categories_church_id_branch_id_idx" ON "giving_categories"("church_id", "branch_id");
CREATE INDEX "templates_church_id_branch_id_idx" ON "templates"("church_id", "branch_id");
CREATE INDEX "sermons_church_id_branch_id_idx" ON "sermons"("church_id", "branch_id");
CREATE INDEX "media_assets_church_id_branch_id_folder_idx" ON "media_assets"("church_id", "branch_id", "folder");
CREATE INDEX "forms_church_id_branch_id_idx" ON "forms"("church_id", "branch_id");
