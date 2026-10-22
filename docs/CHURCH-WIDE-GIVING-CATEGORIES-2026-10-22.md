# Church-wide giving categories — 22 October 2026

Giving categories form one shared list per church. Staff with existing category creation permissions can add a category from any branch. Every authorized branch can read and use it. Church IDs still isolate separate churches; transactions and recurring giving retain their existing branch/member validation and ownership.

Names are trimmed on create/rename and compared without case sensitivity. Archived and inactive categories reserve their names; restore the existing category instead of recreating it. PostgreSQL enforces the same uniqueness, including concurrent inserts/renames. Constraint conflicts return HTTP 409. Blank names are rejected. Category creation's legacy branchId and listing's branchId remain accepted but are ignored for compatibility. The web category page no longer offers a branch filter and explains that the list is shared. Offline bootstrap, updates and deletion tombstones use church-wide category scope, while transaction synchronization stays branch scoped.

## Rollout

Apply `20261022120000_church_wide_giving_categories` and deploy backend/web together. The migration clears category branch ownership and trims names, preserving every category ID and all financial references. It adds a normalized expression unique index and checks requiring a null category branch and a nonblank name. Prisma cannot represent the expression index; its definition lives in the migration.

The migration takes a table lock and checks existing names before changing data. If duplicates (including archived rows) or blank names exist, it rolls back with an explicit error; no automatic renaming, merging or deletion occurs. Review affected categories before rollout. This read-only query identifies duplicate groups:

```sql
SELECT church_id, lower(regexp_replace(name, '^\s+|\s+$', '', 'g')) AS normalized_name,
       array_agg(id ORDER BY id) AS category_ids
FROM giving_categories
GROUP BY church_id, lower(regexp_replace(name, '^\s+|\s+$', '', 'g'))
HAVING count(*) > 1;
```

If Prisma records a failed deployment attempt, resolve that migration as rolled back only after verifying its transaction rolled back and addressing the data conflict, then retry deployment. Category branch ownership constraints require the new backend; pause category writes during the coordinated rollout.

## Verification

Giving/sync unit regressions cover branch creation/list visibility, trimmed names, archived name reservation, blank names, concurrent-write error mapping, shared offline collections/deletions and branch-scoped transaction bootstrap. An isolated PostgreSQL migration regression verifies normalization/uniqueness across archives, church isolation, retained category IDs and transaction branches, and atomic refusal of preexisting duplicates.

No application database migration or deployment was performed.
