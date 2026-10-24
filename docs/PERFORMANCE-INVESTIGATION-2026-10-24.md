# Performance investigation — 24 October 2026

This records source findings before implementation. For the implemented changes and validation, see [PERFORMANCE-IMPROVEMENTS-2026-10-24.md](PERFORMANCE-IMPROVEMENTS-2026-10-24.md).

The strongest current finding is excessive work and waiting along the authenticated API path. Live requests with tiny response bodies consistently spend 1.3–1.9 seconds inside the backend. Repeated database lookups and a one-connection serverless pool are confirmed in the source and are the first changes to evaluate. The exact share due to pool queueing, geography, Redis or deployed compute cannot be assigned without stage-level telemetry and hosting settings.

The preceding [live capacity report](LIVE-CAPACITY-2026-10-24.md) established 1 offered GET/second for two minutes without errors, a failed 2-GET/second run, and timeouts at a 50-request burst. Those are workload-specific observations, not global deployment limits.

## Fresh live evidence

Twelve sequential, read-only HTTP checks used the same designated account, normal authentication and normal guards. Ten API requests and two web-only session checks all returned HTTP 200. This investigation did not run another stress escalation.

| Round | Route | HTTP | Total ms | Backend app ms | Cumulative driver ms | Response bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `/api/session` | 200 | 760 | — | — | 19 |
| 1 | `/api/backend/members` | 200 | 1989 | 1630.0 | 1058.0 | 1745 |
| 1 | `/api/backend/visitors` | 200 | 1787 | 1472.0 | 1127.0 | 1163 |
| 1 | `/api/backend/services` | 200 | 1877 | 1481.0 | 704.0 | 950 |
| 1 | `/api/backend/giving/transactions` | 200 | 2018 | 1684.0 | 1761.0 | 1850 |
| 1 | `/api/backend/reports/financial` | 200 | 2254 | 1936.0 | 845.0 | 526 |
| 2 | `/api/session` | 200 | 294 | — | — | 19 |
| 2 | `/api/backend/members` | 200 | 1655 | 1329.0 | 775.0 | 1745 |
| 2 | `/api/backend/visitors` | 200 | 1817 | 1470.0 | 1128.0 | 1163 |
| 2 | `/api/backend/services` | 200 | 1785 | 1487.0 | 703.0 | 950 |
| 2 | `/api/backend/giving/transactions` | 200 | 1992 | 1680.0 | 1758.0 | 1850 |
| 2 | `/api/backend/reports/financial` | 200 | 1961 | 1648.0 | 563.0 | 526 |

`app` and `db` are existing live Server-Timing values. The backend app timer begins before profile hydration. Database time accumulates instrumented driver calls, including waits/transport; parallel calls can overlap, so the driver total may exceed app elapsed time. These columns must not be subtracted to calculate Redis time. The timing of Nest bootstrap, initial JWKS initialization and upstream connection establishment can sit outside the app timer. The web-only session check took 760 ms initially and 294 ms on repeat and did not query the API. That is a useful baseline, not a direct measurement of proxy overhead for every request.

The small bodies (526–1,850 bytes for tested API routes) and similar warm-repeat delays do not support image size, frontend rendering or download bandwidth as the main cause of these particular API results. Server-rendering/browser performance remains separate and was not benchmarked here. `x-vercel-cache: MISS` is expected for private, uncached HTTP responses and says nothing about a backend Redis cache hit.

A separate read-only dependency diagnostic used the backend's local `.env` database configuration, which points to a Supabase pooler with an `eu-west-1` hostname hint. It used the same transaction-pool port rewrite as the serverless source. Five warm `SELECT 1` round trips took **149–169 ms** from the test machine; establishing the connection took **769 ms**. A representative scoped member SELECT executed inside PostgreSQL in **4.183 ms**, with **7.603 ms** planning time. This sample query is narrower than the full endpoint, and the church is tiny. These numbers demonstrate that many network round trips can cost far more than a simple SQL operation. They are **not** function-to-database timings and do not verify Vercel's current database environment or region.

The local Redis configuration is loopback and could not provide production Redis measurements. A local TCP attempt failed; this is not evidence that deployed Redis is failing. Live responses include rate-limit headers but do not reveal which deployed Redis driver or region is configured. The observed `lhr1` Vercel response identifier identifies the visible web routing path; it does not prove the backend function region.

## Improvements, in recommended order

### 1. Reuse subscription and permission context within each request

Confirmed source path:

1. [RequestContextMiddleware](../src/common/middleware/request-context.middleware.ts) loads the profile, authenticator revision, church state and subscription paid-until.
2. [PermissionsService.getUserPermissions](../src/auth/services/permissions.service.ts) calls `churchEntitlements`, issuing another subscription SELECT before using the permission cache.
3. [PlanFeatureGuard](../src/billing/plan-feature.guard.ts) calls `churchEntitlements` again, issuing another subscription SELECT.
4. [JwtAuthGuard](../src/auth/guards/jwt-auth.guard.ts) checks Redis revocation and [AuthenticatorService.assertSession](../src/auth/services/authenticator.service.ts) queries the approved session.
5. The controller finally performs its business query/queries. Prisma relation hydration can add further driver calls; exact deployed query counts require request logs.

Load the necessary subscription fields once, calculate entitlements once, and pass the resulting request-scoped context to permissions and plan checks. Share one in-flight promise if multiple consumers request it. Preserve fresh expiry checks, profile deactivation, church archive checks, MFA/session approval, role changes and downgrade enforcement. Reusing data inside one request removes duplication without introducing a cross-request authorization TTL.

Expected benefit: fewer remote round trips and less pressure on the single connection. No precise speedup is claimed until an instrumented comparison is run. Verify access regressions for Essentials/Community/Network, expired subscriptions, account deactivation, branch/HQ isolation and MFA before deployment.

### 2. Tune the serverless pool and connection lifetime

[PrismaService](../src/prisma/prisma.service.ts) hardcodes `max: 1` whenever a serverless marker is present. **Setting `DB_POOL_MAX` currently has no effect on serverless instances.** Multiple requests sharing a process therefore queue their database calls behind one connection. The serverless default idle timeout is just 1,000 ms, making connection churn a credible additional cost during gaps. These are source-confirmed settings; deployed overrides and runtime flags need verification.

Make a bounded serverless pool limit configurable. Compare 1, then 2, then 4 connections in an isolated deployment, with pool waiting counts/times and real database connection usage recorded. Evaluate a longer idle lifetime, for example 5–10 seconds initially, together with Vercel lifecycle-aware pool handling where supported. These are experiment values, not settings to apply blindly. Capacity must be budgeted across instances: instance count × per-instance pool, plus workers and administrative clients. Pool changes cannot exceed the Supabase pooler/database limits.

The source already rewrites Supabase session-pool URLs on port 5432 to transaction-pool port 6543 for serverless. Verify the actual runtime target and limits; merely changing that URL again is not a new optimization. Do not raise connection or HTTP timeouts as a substitute for reducing queueing.

### 3. Verify API, database and Redis placement; reduce Redis round trips

Check both Vercel projects' actual function regions, deployed database endpoint, Redis endpoint/region and Fluid compute settings. Place stateful dependencies and API compute close together, then evaluate the web proxy's location relative to the API. The current source does not establish the deployed regions, and this investigation had no authenticated Vercel settings/log access. Region mismatch remains a hypothesis, not a confirmed root cause.

[RedisService.incr](../src/redis/redis.service.ts) runs increment and expiry as two awaited commands. [RateLimitGuard](../src/common/guards/rate-limit.guard.ts) uses this on its TCP path for every non-exempt request. Replace the pair with a suitable atomic one-round-trip operation and preserve the existing window policy and shared enforcement. For REST mode, measure the existing sliding-window limiter and its analytics overhead rather than assuming the TCP path applies. Permission catalog retrieval and session revocation add Redis calls; cached report reads add a cache-version lookup and response lookup. Measure those stages separately and batch only independent operations that preserve the security checks.

Do not disable rate limits, skip revocation/MFA checks or broadly cache authorization state to improve a benchmark. A fast cache should reduce workload; remote cache reads with high latency can themselves add significant request time.

### 4. Improve expensive reports and multi-query lists

[ReportsService.getMonthlyTrend](../src/reports/reports.service.ts) fetches every matching giving amount/date and groups the rows in Node. Attendance and member-growth trends follow the same pattern. Move monthly grouping/counts/sums into parameterized, tenant-scoped SQL so the database returns a few monthly rows. Preserve currency, giving date, inclusive end date, branch scope and general-attendance semantics. This addresses future data growth; it does not explain the entire current delay with only three giving transactions.

[GivingService.listTransactions](../src/giving/giving.service.ts) loads related category/member/service/event/branch data and then performs a separate count. Narrow selected fields and examine generated SQL/query count before choosing a joined lookup or parallel reads. `Promise.all` alone does not create database concurrency when the pool remains one connection. Member and visitor lists already parallelize list/count at the JavaScript level.

Use representative large fixtures and `EXPLAIN (ANALYZE, BUFFERS)` to evaluate tenant/branch/date/order indexes and case-insensitive contains searches. Several indexes already exist in raw migrations as well as Prisma schema, so inspect deployed index definitions before adding more. Do not apply bulk index migrations based on the tiny-church timings.

Existing report caches run after middleware/guards; a cache hit still pays authentication, permissions, entitlement and session cost. Adding response caching alone will not remove that fixed overhead. Preserve current viewer/tenant/branch isolation and mutation-version invalidation in any cache optimization.

### 5. Add enough telemetry to prove the bottleneck and gains

Keep existing request IDs and safe query counts/durations; add separate timings for profile hydration, entitlement resolution, permission cache, rate limiting, session approval, response cache, handler work, pool acquisition and SQL execution where available. Record pool total/idle/waiting counts. Time the web proxy's upstream wait separately and correlate request IDs across web and API. Include failures and cancellations, not just successful interceptor responses. Current cumulative database timing is useful but cannot distinguish query execution from queue/network wait.

Verify cold versus warm invocation latency, memory/CPU and throttling with Vercel logs. Queue processors are already disabled by default in serverless source; verify `ENABLE_QUEUE_WORKERS` has not explicitly enabled them in HTTP functions. Keep long imports, PDF/Excel generation, messaging and scheduled work on appropriately configured workers as volume grows. No evidence in this run establishes those jobs as the current read bottleneck.

The frontend already has a 60-second query stale time, disables automatic retries/focus/reconnect refetching, and shares query cache entries. Avoid blanket increases to browser cache lifetimes as the first fix; inspect actual page request fan-out after reducing per-request overhead.

## Validation and rollout

Start with request-scoped subscription reuse and instrumentation. Next test small, bounded pool changes. Confirm region placement before buying more compute or changing providers. Database index/report changes follow representative query-plan evidence.

For each isolated change, compare the same read-only route mix, data and hosting conditions. Check cold/warm sequential p50/p95/p99, then 1 and 2 requests/second, then higher levels only while errors and latency remain controlled. Repeat a two-minute steady run and recovery check; record successful throughput, timeouts, cancelled requests, pool waits and connection counts. A larger and longer authorized staging run is needed before asserting a new production capacity. True concurrent-user testing also needs distinct authorized sessions and a realistic page journey.

No production application code, database schema, rate limits or hosting settings were changed by this investigation. The only live application action beyond GETs was normal test-account sign-in. Dependency SQL ran in a read-only transaction and was rolled back. Temporary session files are removed after checking the report. Diagnostic helpers are in `test/load/diagnose-live.mjs` and `test/load/diagnose-dependencies.mjs`; sanitized measurements are in [PERFORMANCE-INVESTIGATION-2026-10-24.json](PERFORMANCE-INVESTIGATION-2026-10-24.json).

Provider references: [Vercel function region configuration](https://vercel.com/docs/functions/configuring-functions/region), [Vercel Fluid compute concurrency](https://vercel.com/kb/guide/vercel-services-fluid-compute), [Supabase connection pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits), [Redis latency and reducing round trips](https://redis.io/docs/latest/management/optimization/latency/).
