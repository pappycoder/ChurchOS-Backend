-- Recurring services store wall-clock times, with no calendar date or time zone.
-- Existing columns are timestamp without time zone; preserve their clock component.
ALTER TABLE "services"
  ALTER COLUMN "start_time" TYPE TIME(3) WITHOUT TIME ZONE USING "start_time"::time(3),
  ALTER COLUMN "end_time" TYPE TIME(3) WITHOUT TIME ZONE USING "end_time"::time(3);
