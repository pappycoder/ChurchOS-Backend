# Authentication and cache performance — 24 October 2026

Implemented the next changes suggested by the [live retest](LIVE-CAPACITY-RETEST-2026-10-24.md), which still failed a sustained 2-request/second run. This patch reduces database and Redis round trips without increasing the production connection budget. It has not been deployed or benchmarked on production.

| Path | Before | Now |
| --- | --- | --- |
| Fresh profile/church/subscription/authenticator-revision hydration | 4 PostgreSQL driver calls | 1 parameterized joined SELECT |
| Administrator global permission-name catalogue | Redis GET on every resolution | In-process catalogue, refreshed from PostgreSQL every 30 seconds |
| Warm response cache lookup | Version GET followed by response GET | One MGET of current version and the hinted response key |
| Revocation and MFA/session approval | Sequential reads | Concurrent reads, both required before access |

## Implementation and security

[hydrated-profile.ts](../src/auth/services/hydrated-profile.ts) selects only the fields previously requested by middleware. Joins bind the subscription and church to the authenticated profile; the user ID is parameterized after JWT verification. The query excludes authenticator ciphertext, recovery hashes and profile contact data. An integration test compares its complete result to the original Prisma relation projection, verifies four driver calls become one, exercises two tenants and checks missing users. Profile data is still loaded fresh on every request.

The permission-name catalogue is global schema metadata, separate from role grants. Its 30-second cache is process-local, coalesces concurrent misses, retries failures and returns independent arrays. Custom/template role resolution retains its tenant-bound Redis cache; profile status, plan eligibility and current subscription checks still run. Newly changed catalogue names may take up to 30 seconds to refresh in an existing process, compared with the previous Redis catalogue TTL of 15 minutes. A failed expired refresh does not serve stale catalogue data. This trades occasional catalogue SQL reads for removal of the costly per-request Redis read; it does not promise a provider billing reduction.

[JwtAuthGuard](../src/auth/guards/jwt-auth.guard.ts) now overlaps independent revocation and approved-session reads. It waits for both via `Promise.allSettled`, preserves revocation error precedence and observes both failures. Redis revocation outages still fail closed, revoked tokens remain rejected, and missing/expired approvals or mismatched authenticator revisions remain rejected. Parallel execution introduces no session or authorization cache.

The response cache retains the existing tenant/viewer/permission/branch/path key and mutation version scheme. A bounded 500-entry map stores only version hints. Every read still obtains the current version from Redis atomically with the hinted entry. If the actual version differs, that entry is discarded and the handler recomputes under the new version. The hint never authorizes stale data. Redis failures bypass the response cache, and versioned writes/invalidation continue to use the existing keys. A cold or invalidated hint can cause one extra recomputation. Redis deployments that reject multi-key reads will fall back to fresh handler execution; provider acceptance remains part of deployment verification. No cache data/schema migration is required.

## Runtime visibility

Server-Timing now exposes `pool_max` from the actual driver pool, `redis_driver` from the configured Redis service, and a validated `runtime_region` when `VERCEL_REGION` is available. These reveal actual API-function settings on the next deployment instead of inferring them from frontend routing headers. Existing query counts, stage durations and sampled waiting counts remain. Stage durations overlap and must not be added as disjoint time intervals.

The serverless pool default remains one connection. No Vercel token or CLI credential file is available in this workspace, so deployed regions, Redis placement and connection budgets were not changed or independently inspected. This patch reduces work within the current budget. After observing the new runtime markers and provider limits, the previously documented controlled pool experiments can still be evaluated separately.

## Validation

- **393 targeted unit checks across 25 suites passed**, including the additional runtime metadata regression. Covers catalogue coalescing/expiry/mutation safety, role and subscription policy, fresh context, parallel session checks and failure precedence, atomic cache invalidation/outage behavior, tenant/branch/viewer keys, Redis driver decoding, request timing and existing reports/billing.
- **22 real PostgreSQL checks across five suites passed**: 19 existing subscription/report/receipt checks plus three new joined-profile checks. The new checks verify exact field parity, **4→1 driver calls**, secret exclusion, tenant identity, fresh deactivation/subscription expiry/church archive checks, and real MFA approval revision/expiry enforcement. These use the isolated local test database and fictional profiles only.
- TypeScript, targeted lint and backend production build passed.
- The previously documented 62 baseline role/authorization audit failures remain outside these passing targeted suites; this patch does not claim the full repository test suite passes.
- Test fixtures were cleaned up and the local PostgreSQL cluster stopped. No production account, financial, attendance, provider or hosting writes were performed for this implementation.

## Deployment and measurement

Deploy the backend; no frontend build, database migration or seed is needed. Existing web proxy forwarding preserves the new Server-Timing fields. Keep pool/rate/security settings unchanged for the initial comparison, verify `pool_max`, `redis_driver` and `runtime_region`, and run sequential diagnostics before escalating the same read-only workload from 1 to 2 requests/second. Check two-minute confirmation and recovery, not just a short pass. A live capacity increase remains unmeasured until that deployment and retest.
