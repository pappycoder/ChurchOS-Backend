-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "giving_categories" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_ticket_tiers" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sermons" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pastoral_notes" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "life_events" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "cell_groups" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "asset_categories" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "custom_field_definitions" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "visitors" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "webhook_subscriptions" ADD COLUMN     "archived_at" TIMESTAMP(3);