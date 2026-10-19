# Retire the Member login role

The application no longer offers a `member` login role. Church member records, staff-to-member links, department/cell-group membership positions and business history remain intact. Nine built-in staff roles and church-owned custom roles remain available.

## Implementation

- Remove the role from invitation/assignment DTOs, seed catalogs, rank/order lists, developer profile examples and web selectors/development login shortcuts.
- Remove implicit Member role defaults from profiles and UI. Invitation forms require an explicit role; unassigned profiles display No role assigned.
- Reject member-only/unassigned profiles in request hydration and guarded role resolution. Ignore retired-role permission resolutions even if old cache entries or overrides exist. Permission cache namespace is v29.
- Keep the retired name reserved so church-owned custom roles cannot recreate it. Direct role-management requests treat it as missing.
- Development seeds no longer create member-only Auth accounts; staff seed definitions no longer include the retired role.

## Migration and deployment

Apply `20261019120000_remove_member_login_role` before deploying the matching API/web build. It removes the role from mixed profiles while preserving staff roles/status; member-only profiles become inactive with an empty role list. It deletes retired role catalog entries/grants/overrides and adds database checks against reintroduction. Profile roles default to an empty array and grant no implicit access. Supabase Auth identities are retained; database profile status/roles control application access.

No profile, Auth account, member directory record or historical business record is deleted. An administrator must assign an intended supported staff role and reactivate a former member-only account to restore application access. Do not automatically promote these accounts. Re-seeding reference permissions no longer restores the retired role.

The migration is repeatable and covered by a disposable local PostgreSQL regression that verifies mixed-role preservation, deactivation, retained member links, unrelated grants, default behavior and rejection of reintroduced roles. No live database mutation is part of this implementation task.

Subscription capacities now distinguish member directory records from staff login seats. See SUBSCRIPTION-ENTITLEMENTS-PLAN-2026-10-19.md and SUBSCRIPTION-UI-DESCRIPTION-2026-10-19.md.
