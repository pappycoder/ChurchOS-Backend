-- AddForeignKey
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
