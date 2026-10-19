# Subscription entitlement rollout plan

Status: proposed implementation; runtime enforcement is not implemented by this document.

The agreed immediate change is Essentials at 100 members for ₦10,000/month or ₦108,000/year, one location and two staff accounts. The web display catalog has been updated. Community and Network prices and allowances remain unchanged.

## Plan contract

| Plan | Members | Locations, including HQ | Staff accounts, including church administrator |
| --- | ---: | ---: | ---: |
| Essentials | 100 | 1 | 2 |
| Community | 300 | 1 | 5 |
| Network | 1,500 | 3 | 15 |
| Enterprise | Explicit agreement | Explicit agreement | Explicit agreement |

These are church-wide totals across all branches, not per-branch allowances. They are distinct from Supabase MAU and database limits. Members are directory records without a login role. Every enabled application login profile consumes a staff seat.

Proposed counting rules to finalize before enabling enforcement:

- Members: all non-archived member records, including inactive/suspended/transferred statuses. Changing a status must not bypass capacity. Visitors are separate; conversion into a member consumes a member slot.
- Locations: all non-archived branches, including headquarters. Restoring a location consumes capacity.
- Staff: non-archived, enabled profiles with at least one supported staff role, including church administrators, church-scoped super administrators and custom roles. Count each profile once regardless of its number of roles. Invitations reserve seats until provisioning completes or the reservation expires. Deactivation/archive releases a seat; reactivation, restore and assignment of a staff role to an unassigned account must recheck capacity. Retained historical records still consume database storage.
- The registration flow must consistently provision or account for the initial administrator and HQ. Platform support access must be separately authenticated and audited, never inferred from a church role to bypass quotas.
- Enterprise needs persisted, validated, negotiated limits and feature grants. Missing configuration must fail closed for capacity-increasing writes, with an actionable support message; never silently grant unlimited capacity.

## Existing enforcement and integration points

`src/common/middleware/request-context.middleware.ts` already verifies subscription expiry and retains authentication, billing and self-profile access for recovery. `src/auth/guards/permissions.guard.ts` enforces role-based permissions. Preserve both responsibilities and church/branch scope checks.

`src/billing/plans.ts` currently owns checkout prices only. Add typed plan limits/features here or in a dedicated server-owned entitlement catalog. Return the resolved catalog from the billing API so the web can render commercial capacities without parsing strings or maintaining a second authoritative limit map. Keep the public landing catalog synchronized or consume a safe public catalog endpoint.

Add an `EntitlementsService` that resolves the paid church subscription, plan version and optional Enterprise agreement. A feature guard/decorator should require the plan feature independently of the existing permission grant. Effective authorization requires a valid subscription, the plan feature, the user's permission and the applicable tenant/branch scope. A church role editor must not grant a feature the church has not purchased.

Feature families should mirror the advertised cumulative packages:

- Essentials: directory/visitors, services/attendance, visitor follow-up and access administration.
- Community adds giving/receipts, events/registration, departments/cell groups, forms/reports and church email integration.
- Network adds branch/HQ management, SMS/WhatsApp, paid tickets/check-in, pastoral care/appointments, inventory and administrator analytics.
- Enterprise starts with Network and applies explicitly agreed limits/services.

Inventory precise read/write routes and feature dependencies before activating this matrix. Existing cross-module pickers, public forms, ticket claims, callbacks and exports need deliberate mappings. Existing role restrictions still apply, including administrator-only analytics/integrations. Provider accounts and credentials remain church-owned; subscription inclusion does not fund external message usage.

## Transactional capacity enforcement

A guard that performs `count < limit` before the handler is insufficient: concurrent requests can both pass. Use the service layer for the authoritative capacity check and write in the same database transaction.

For every capacity-increasing path, acquire a shared per-church transaction lock, resolve the effective entitlement inside the transaction, count the relevant records/reservations, validate the requested increase and write. A row lock on the church record is one implementation option. All affected writers, including plan changes, must follow the same locking convention and ordering. Ensure the billing plan-update path cannot race with quota evaluation.

Audit and cover at least:

| Resource | Existing entry points requiring coverage |
| --- | --- |
| Members | `members.service.ts` create/import/restore paths; `visitors.service.ts` conversion; `sync/offline.service.ts` offline create; any generic sync write delegates or administrative scripts |
| Staff | `profile.service.ts` invitation, reactivation, restore, role/status updates; `auth.service.ts` registration; administrator provisioning scripts |
| Locations | `branches.service.ts` creation/restoration; initial HQ provisioning; any import/sync/admin writers |

Reserve a staff seat atomically before calling Supabase invitation APIs; do not hold a database transaction open during a network call. Finalize the reservation/profile idempotently, reconcile retries and uncertain outcomes, and expire/release abandoned reservations safely. This likely needs a migration. An existing Auth user must not consume another seat on an idempotent retry.

Imports must preserve their documented partial-success or atomic behavior, account for deduplication and report rejected rows clearly. Offline sync must evaluate current server limits on push, preserve rejected client drafts and retain mutation idempotency. Restores and visitor conversion must never partially mutate a record when capacity validation fails.

Use stable machine-readable errors, e.g. `PLAN_LIMIT_REACHED` with resource, current usage, requested increase, allowed limit and plan. Adapt the existing exception filter so clients receive these details. Use a distinct `PLAN_FEATURE_REQUIRED` for feature restrictions; preserve existing authentication, permission and expired-subscription errors.

## Lifecycle and user experience

- Extend authenticated billing status with entitlements, usage and remaining capacity; keep it restricted by billing permission. Provide only minimal feature availability in self-profile for navigation; do not expose sensitive billing data to all staff.
- Show administrators clear usage such as `87 / 100 members`, warn around 80%/90%, and show an upgrade action at capacity. Ordinary authorized staff get an actionable message referring them to their administrator. The API remains authoritative.
- Upgrades take effect only after verified payment. Current billing rejects checkout while a subscription is active; implement active-plan switching and explicitly define proration, credits and effective dates before relying on an Upgrade button. Repeated callbacks must not reapply changes.
- Prefer scheduling downgrades for renewal. Keep existing data when usage exceeds the new allowance, block further increases to that resource, and permit reductions. Allow authorized historical reads/exports for removed paid features while blocking new feature use; define this explicitly for each feature rather than removing all access to stored data.
- Keep renewal, account recovery and provider settlement callbacks reachable when access expires. Already accepted church-owned payments must still reconcile after a downgrade or expiry; queued messaging must recheck current entitlements before new deliveries.
- Invalidate entitlement caches after verified plan changes and Enterprise agreement updates. Capacity decisions must use transactional database state rather than cached counts.

## Delivery order and acceptance

1. Finalize counting rules and the route-level feature matrix. Add the typed server catalog, Enterprise agreement representation and read-only usage API.
2. Implement transactional member/location capacity checks and staff reservation lifecycle across every writer. Audit existing customer usage first and surface over-limit states without deleting data.
3. Add plan-feature guards, including workers/public entry points, and UI capability/usage rendering. Implement paid active-plan upgrades before linking enforcement messages to checkout.
4. Verify in an isolated database: exact boundary acceptance/rejection; concurrent creates at the last slot; imports/conversions/offline retries; invite failures and retries; role changes/restores; branch/HQ totals; custom roles; Enterprise missing configuration; tenant isolation; downgrade preservation; expiry recovery; signed callback idempotency and settlement.
5. Stage migration and an observation period before enabling enforcement. Review existing churches against their paid agreements, then enable in production with coordinated backend/worker/web deployment. Do not alter live subscriptions or records as part of planning.

Commercial capacities protect plan boundaries. Separate monitoring and retention are still required for database space, uploads, audit logs, sync data, compute and external provider spending.
