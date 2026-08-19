-- CreateTable
CREATE TABLE "visitors" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "phone" TEXT,
    "whatsapp_number" TEXT,
    "email" TEXT,
    "first_visit_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "follow_up_status" TEXT NOT NULL DEFAULT 'new',
    "assigned_to_id" TEXT,
    "notes" TEXT,
    "converted_member_id" TEXT,
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "church_role_permissions" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "church_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visitors_church_id_follow_up_status_idx" ON "visitors"("church_id", "follow_up_status");

-- CreateIndex
CREATE INDEX "visitors_church_id_assigned_to_id_idx" ON "visitors"("church_id", "assigned_to_id");

-- CreateIndex
CREATE INDEX "custom_field_definitions_church_id_idx" ON "custom_field_definitions"("church_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_church_id_name_key" ON "custom_field_definitions"("church_id", "name");

-- CreateIndex
CREATE INDEX "church_role_permissions_church_id_role_name_idx" ON "church_role_permissions"("church_id", "role_name");

-- CreateIndex
CREATE UNIQUE INDEX "church_role_permissions_church_id_role_name_permission_id_key" ON "church_role_permissions"("church_id", "role_name", "permission_id");

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_converted_member_id_fkey" FOREIGN KEY ("converted_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_role_permissions" ADD CONSTRAINT "church_role_permissions_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_role_permissions" ADD CONSTRAINT "church_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
