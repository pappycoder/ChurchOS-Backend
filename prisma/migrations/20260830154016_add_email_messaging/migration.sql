-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "sender_name" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reply_to_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_recipients" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_messages_church_id_created_at_idx" ON "email_messages"("church_id", "created_at");

-- CreateIndex
CREATE INDEX "email_recipients_profile_id_read_at_idx" ON "email_recipients"("profile_id", "read_at");

-- CreateIndex
CREATE INDEX "email_recipients_message_id_idx" ON "email_recipients"("message_id");
