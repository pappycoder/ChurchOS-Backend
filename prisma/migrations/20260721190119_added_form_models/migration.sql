/*
  Warnings:

  - A unique constraint covering the columns `[public_token]` on the table `forms` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `church_id` to the `form_submissions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "form_submissions" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "church_id" TEXT NOT NULL,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "status" "SubmissionStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_template" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_token" TEXT;

-- CreateIndex
CREATE INDEX "form_submissions_church_id_idx" ON "form_submissions"("church_id");

-- CreateIndex
CREATE INDEX "form_submissions_church_id_status_idx" ON "form_submissions"("church_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "forms_public_token_key" ON "forms"("public_token");

-- CreateIndex
CREATE INDEX "forms_church_id_status_idx" ON "forms"("church_id", "status");

-- CreateIndex
CREATE INDEX "forms_church_id_is_template_idx" ON "forms"("church_id", "is_template");
