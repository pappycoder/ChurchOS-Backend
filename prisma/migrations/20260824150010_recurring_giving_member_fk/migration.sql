-- RecurringGiving: formalize the member relation (cascade with NDPR member purge)
ALTER TABLE "recurring_giving" ADD CONSTRAINT "recurring_giving_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
