-- Convert profiles.role from a single string to a text array.
-- Existing values are preserved as single-element arrays. The array is
-- ordered by role rank (descending) by application convention, so
-- role[0] is the user's primary role.
ALTER TABLE "profiles" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "profiles" ALTER COLUMN "role" TYPE TEXT[] USING ARRAY["role"]::text[];
ALTER TABLE "profiles" ALTER COLUMN "role" SET DEFAULT ARRAY['member']::text[];
