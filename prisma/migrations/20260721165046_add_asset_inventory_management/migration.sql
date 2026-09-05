/*
  Warnings:

  - You are about to drop the column `category` on the `assets` table. All the data in the column will be lost.
  - You are about to drop the column `maintenance_date` on the `assets` table. All the data in the column will be lost.
  - The `status` column on the `assets` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[church_id,asset_tag]` on the table `assets` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `asset_tag` to the `assets` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('active', 'maintenance', 'retired', 'lost', 'disposed');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('new', 'good', 'fair', 'poor', 'damaged');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('straight_line', 'reducing_balance');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AssetLoanStatus" AS ENUM ('borrowed', 'returned', 'overdue');

-- AlterTable
ALTER TABLE "assets" DROP COLUMN "category",
DROP COLUMN "maintenance_date",
ADD COLUMN     "asset_tag" TEXT NOT NULL,
ADD COLUMN     "branch_id" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "condition" "AssetCondition" NOT NULL DEFAULT 'good',
ADD COLUMN     "custodian_id" TEXT,
ADD COLUMN     "department_id" TEXT,
ADD COLUMN     "depreciation_method" "DepreciationMethod" NOT NULL DEFAULT 'straight_line',
ADD COLUMN     "model" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "salvage_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "serial_number" TEXT,
ADD COLUMN     "useful_life_years" INTEGER,
DROP COLUMN "status",
ADD COLUMN     "status" "AssetStatus" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'scheduled',
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "completed_date" TIMESTAMP(3),
    "cost" DOUBLE PRECISION,
    "performed_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_depreciation" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "opening_value" DOUBLE PRECISION NOT NULL,
    "depreciation_amount" DOUBLE PRECISION NOT NULL,
    "closing_value" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_depreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_loans" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "borrower_member_id" TEXT,
    "borrowed_by_name" TEXT,
    "loan_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_return_date" TIMESTAMP(3) NOT NULL,
    "actual_return_date" TIMESTAMP(3),
    "status" "AssetLoanStatus" NOT NULL DEFAULT 'borrowed',
    "condition_before" "AssetCondition",
    "condition_after" "AssetCondition",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_scan_logs" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "scanned_by_id" TEXT,
    "scan_type" TEXT NOT NULL DEFAULT 'check',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_categories_church_id_idx" ON "asset_categories"("church_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_church_id_name_key" ON "asset_categories"("church_id", "name");

-- CreateIndex
CREATE INDEX "asset_maintenance_asset_id_idx" ON "asset_maintenance"("asset_id");

-- CreateIndex
CREATE INDEX "asset_maintenance_asset_id_status_idx" ON "asset_maintenance"("asset_id", "status");

-- CreateIndex
CREATE INDEX "asset_maintenance_asset_id_scheduled_date_idx" ON "asset_maintenance"("asset_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "asset_depreciation_asset_id_idx" ON "asset_depreciation"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_depreciation_asset_id_year_key" ON "asset_depreciation"("asset_id", "year");

-- CreateIndex
CREATE INDEX "asset_loans_asset_id_idx" ON "asset_loans"("asset_id");

-- CreateIndex
CREATE INDEX "asset_loans_asset_id_status_idx" ON "asset_loans"("asset_id", "status");

-- CreateIndex
CREATE INDEX "asset_scan_logs_asset_id_idx" ON "asset_scan_logs"("asset_id");

-- CreateIndex
CREATE INDEX "asset_scan_logs_asset_id_created_at_idx" ON "asset_scan_logs"("asset_id", "created_at");

-- CreateIndex
CREATE INDEX "assets_church_id_status_idx" ON "assets"("church_id", "status");

-- CreateIndex
CREATE INDEX "assets_church_id_category_id_idx" ON "assets"("church_id", "category_id");

-- CreateIndex
CREATE INDEX "assets_church_id_asset_tag_idx" ON "assets"("church_id", "asset_tag");

-- CreateIndex
CREATE UNIQUE INDEX "assets_church_id_asset_tag_key" ON "assets"("church_id", "asset_tag");

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_custodian_id_fkey" FOREIGN KEY ("custodian_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_loans" ADD CONSTRAINT "asset_loans_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_loans" ADD CONSTRAINT "asset_loans_borrower_member_id_fkey" FOREIGN KEY ("borrower_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_scan_logs" ADD CONSTRAINT "asset_scan_logs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
