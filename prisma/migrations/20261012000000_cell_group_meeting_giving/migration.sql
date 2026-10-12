-- Keep a single combined giving record per group meeting, including concurrent submissions.
CREATE UNIQUE INDEX "transactions_cell_group_meeting_giving_key"
ON "transactions" ("church_id", ("metadata"->>'cellGroupId'), ("metadata"->>'cellGroupMeetingDate'))
WHERE "metadata"->>'cellGroupId' IS NOT NULL
  AND "metadata"->>'cellGroupMeetingDate' IS NOT NULL;
