-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "submission_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unique_field" TEXT;
