# Analytics administration access — 2026-10-18

Only church_admin and super_admin receive analytics permissions. API endpoint guards remain permission-based. Central getUserPermissions removes every analytics:* grant from all other roles after unioning their grants, so cached defaults, church overrides, church-owned custom roles and HQ status cannot confer analytics access. Administrator/mixed-role users continue to receive the permission catalog.

Default pastor, treasurer and usher templates no longer include analytics. Migration 20261018210000_admin_only_analytics removes existing non-administrator analytics role grants and overrides without deleting the permission catalog, administrator grants or unrelated reports. Cache namespace v25 replaces old role permission entries.

Frontend navigation and direct routes already consume effective permissions. Each analytics query now additionally requires its own surface read grant and respects existing enabled options. No frontend role-name guards were added. Existing report/operational permissions are unchanged.

Apply the migration, deploy backend and frontend, and refresh signed-in sessions so menus update. Backend enforcement applies to requests regardless of stale browser menus. No deployed data or configuration was changed during local verification.

Verified locally: 240 backend permission/guard/analytics unit tests, 298 frontend unit tests, and 22 browser role/HQ scenarios passed. Browser scenarios cover all four analytics pages for both administrator roles, every other built-in role and a custom role, with HQ enabled and disabled; denied users have no analytics links and make no analytics API requests. Frontend production build, scoped lint, UI contract audit and PostgreSQL migration/idempotency checks passed. Database tests used only a temporary schema in the disposable local database.
