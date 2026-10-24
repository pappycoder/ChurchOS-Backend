# Performance improvements — 24 October 2026

Implemented backend changes following the [live investigation](PERFORMANCE-INVESTIGATION-2026-10-24.md). These changes are verified locally and have not been deployed. The earlier live capacity figures remain the latest production measurements.

- Profile hydration now supplies an internal tenant-bound subscription snapshot to role resolution and the plan guard. This removes their two additional subscription SELECTs in the normal request path. A test exercises middleware, actual permission resolution and the guard and verifies zero extra subscription queries. Nothing is cached between requests. Mismatched tenant snapshots fall back to a fresh lookup. Expiry is evaluated when accessed; mutations still use the fresh business-service entitlement path. Account status, church archive, branch scope, session revocation and MFA checks remain.
- Serverless database pools now accept `DB_SERVERLESS_POOL_MAX` (integer 1–10). Default remains **1**, and persistent processes retain `DB_POOL_MAX`. Existing idle/connect timeout overrides apply to both. Malformed settings fail early. The Supabase transaction-pool URL rewrite remains. No database connection budget was raised in production.
- Expiring Redis counters now increment and refresh expiry atomically in one Lua evaluation, replacing two sequential network round trips. TCP and Upstash REST drivers are covered. Existing expiry-refresh and rate-window semantics remain. Real-provider performance and Lua execution were not exercised against production Redis; verify its ACL permits EVAL during staging acceptance.
- Financial, attendance and member monthly trends are grouped in parameterized PostgreSQL queries. They return monthly rows instead of every matching gift/check-in/member. Financial totals/category/month queries are independent and now submitted together. Tenant, branch, status, currency and full final-day filters are retained. Months use the UTC timestamps stored by the schema. A zero-valued giving month now correctly returns zero; the former JavaScript `value || 1` fallback could count a zero gift as one.
- Server-Timing and structured logs now include JWT, profile hydration, permissions, rate-limit, entitlement, session approval, revocation, response-cache and handler/interceptor durations where executed. Driver calls are counted and sampled pool total/idle/waiting high-water values are recorded. These samples are not continuous queue telemetry and do not measure exact connection-acquisition time. Stage/driver durations overlap and must not be summed. Exception responses also carry available timing when a guard rejects before interceptors. Safe inbound request IDs are retained for correlation; SQL, parameters and session tokens are not added to telemetry.

## Isolated comparison

The report comparison used the original ReportsService at commit `c26ab73447e56d14304df0ec73f8382f7049760c` and the optimized implementation, alternating on the same PostgreSQL client with one connection. One warmup pair preceded seven measured pairs. The fictional church had 1,000 giving records spanning 10 months. Before/after report outputs matched exactly.

| Measurement | Before | After |
| --- | ---: | ---: |
| Median financial-report duration | 5.370 ms | 3.993 ms |
| Rows needed in application for monthly grouping | 1,000 gifts | 10 monthly aggregates |
| Additional subscription SELECTs in normal middleware/role/plan path | 2 | 0 |

The timing comparison measures the local report service only. It excludes production auth, Redis, network and HTTP routing and is not a prediction of live response times or capacity. No increase to concurrent-user capacity can be claimed until deployment and a controlled live retest.

Repeat the report comparison by starting the isolated fixture server from `test/load/README.md`, then running `TEST_DATABASE_URL=LOCAL_TEST_URL BASELINE_REF=c26ab73447e56d14304df0ec73f8382f7049760c node test/load/compare-reports.cjs`. It refuses remote/non-test databases and checks the selected church carries the capacity-fixture prefix. Stop the fixture server afterward to remove its fictional records. Sanitized samples are in [PERFORMANCE-IMPROVEMENTS-2026-10-24.json](PERFORMANCE-IMPROVEMENTS-2026-10-24.json).

## Validation

- 18 targeted unit suites: **347 passed**. Covers subscriptions/plan roles, billing, authentication/session state, request tenant scope, Redis operation boundaries, pool limits, timing isolation/failure headers, report mapping and credential-log privacy.
- Four real PostgreSQL suites: **19 passed**. Covers existing receipts/report financial data, subscription and feature boundaries, plus the new monthly aggregation checks for multiple tenants/branches, currencies, status, zero gifts and month-end timestamps.
- TypeScript checking, targeted lint and backend production build passed.
- A broader authentication audit run found **62 pre-existing failures** across `role-scope-matrix` (55), `retired-role` (6) and `route-authorization` (1). All 62 reproduced on a separate unchanged checkout at the baseline commit, so they are not introduced by this patch. They concern old subscription mock fixtures, validation constraint expectations and the public invitation-route audit exception; they remain separate test maintenance work. The broad run had 455 passing tests before the final two added regressions; it is not reported as a fully passing suite.
- Test/benchmark fixtures were removed and the isolated database was stopped. No live financial, attendance, member or provider records were changed during implementation.

## Deployment and next measurements

Deploy the backend; no schema migration, data seed or frontend deployment is required. The existing web proxy already forwards Server-Timing and request IDs. Region settings, provider connection budgets and actual production Redis latency still require hosting telemetry; no authenticated Vercel settings access was available in this workspace.

Initially retain the existing connection budget and compare warm/cold route timings with the new stages. Use the authorized read-only workload at 1 request/second, then 2 only while the automatic stops remain healthy. Record successful throughput, p50/p95/p99, errors, cancellations, sampled waiting counts and provider connections.

After checking the total instance/worker connection budget, evaluate `DB_SERVERLESS_POOL_MAX=2` in staging, then 4 only if justified, and compare `DB_IDLE_TIMEOUT_MS=5000` with the current idle setting. These are explicit experiments rather than new defaults. Roll back pool settings if pooler/client limits or queueing worsen. Keep API compute close to the confirmed database/Redis regions. Do not buy larger tiers, weaken access/rate guards or lengthen request timeouts as a substitute for these measurements.
