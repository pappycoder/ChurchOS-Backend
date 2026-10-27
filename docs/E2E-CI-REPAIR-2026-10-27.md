# PostgreSQL E2E CI repair — 2026-10-27

The reported run failed 75 of 178 tests across nine suites. Most failures occurred during fixture setup: real database entitlement triggers rejected locations, members or staff for churches without an appropriate active subscription. Provider-account workflow fixtures also lacked channel entitlements.

## Changes

- Six workflow suites explicitly seed paid Network subscriptions before creating their multi-location or provider data. The shared helper is opt-in; it does not alter plan-boundary fixtures or global setup.
- Sync-outbox trigger fixtures seed paid Essentials inside their rolled-back transaction. Trigger assertions inspect the queue after each mutation and verify its snapshots, avoiding an invalid ordering assumption for transaction-scoped NOW() timestamps. Account-deletion fixtures use Community, which supports the Usher role.
- Receipt tests assert the original entry timestamp separately from the selected backdated giving date.
- Form workflow tests now verify foreign-branch rejection without persistence, implicit actor-branch assignment and read-only denial. A foreign branch must not silently become the actor branch.
- Role-workflow teardown explicitly removes members before churches to respect restrictive foreign keys. Updated sync test formatting to pass targeted lint.

All changes are test fixtures, assertions or documentation. No application permission, subscription enforcement, migration, tenant policy or production code changed. No tests were skipped.

## Verification

Used a new disposable PostgreSQL 18 cluster bound to loopback, prepared the unprivileged RLS roles and applied the complete migration history to an empty test database. Docker was unavailable locally, so the PostgreSQL 16 CI environment remains the final version-specific check. No application or shared database was used.

- `npm run test:e2e -- --runInBand`: all 26 suites and 180 tests pass (two additional branch/permission regressions).
- `npx tsc --noEmit`: passes.
- Targeted ESLint for every changed TypeScript file: passes.
- `git diff --check`: passes.

The disposable PostgreSQL cluster was stopped after verification. No production writes, migrations or deployment were performed.
