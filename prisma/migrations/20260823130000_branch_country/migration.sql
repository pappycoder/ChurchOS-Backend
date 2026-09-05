-- Add country to branches (mirrors churches.country default).
ALTER TABLE "branches"
  ADD COLUMN "country" TEXT NOT NULL DEFAULT 'Nigeria';
