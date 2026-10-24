# Live capacity after authentication/cache changes — 24 October 2026

The newest backend code is confirmed live by the actual pool, Redis-driver and runtime-region Server-Timing fields and the reduced warm profile/query counts. The private test session was established through normal sign-in to Grace Community Church. All tests followed the same authenticated web-proxy path and read-only route mix used in [the previous retest](LIVE-CAPACITY-RETEST-2026-10-24.md). No production configuration, rate-limit, plan or business-record writes were performed.

## Findings

- Largest completed error-free burst tested: **50 simultaneous client requests**, p95 **5.796 s**. This is a lower bound for tested bursts, not an established global maximum.
- Highest error-free two-minute offered rate verified: **2 requests/second**, 241 completed requests, successful throughput **1.989/s**, p50 **1.161 s**, p95 **1.686 s**, p99 **1.895 s**.
- `live-auth-cache-rates` at level **4** stopped/failed: 48 HTTP 200 responses, 1 client timeout/network failures, 0 throttles, 35 in-flight requests cancelled; p95 **9.074 s** among completed attempts.
- `live-auth-cache-confirm-3` at level **3** stopped/failed: 248 HTTP 200 responses, 3 client timeout/network failures, 0 throttles, 25 in-flight requests cancelled; p95 **8.234 s** among completed attempts.

Only one authorized identity and a tiny church dataset were used. These request figures do not establish distinct concurrent-user capacity or performance for larger churches, writes, browser rendering, exports, AI or messaging. Each stage stops escalation on failure, and no higher stage in that series is attempted. A 10-second ceiling is a stress safety deadline, not a user-experience recommendation.

## Sustained-rate refinement and recovery

The later refinement rechecked the same live runtime markers (`pool_max=1`, `redis_driver=upstash-rest`, `runtime_region=iad1`) at 19:45 UTC. These runs occurred later than the original series; normal provider load, cache state and user activity were not controlled.

At **3 requests/second**, the 30-second stage completed **91/91** successfully, with p95 **5.251 s**. The longer stage scheduled for 120 seconds failed after a measured span of **91.345 seconds**: **248 HTTP 200 responses, 3 request timeouts and 25 canceled in-flight requests**. Completed-attempt p95 was **8.234 s**. There were no observed HTTP 429, authentication errors or HTTP 5xx responses in that stage. A short pass therefore does not establish sustainable capacity at 3 requests/second.

Following a cooldown, recovery at **2 requests/second for 60 seconds** completed **120/120** successfully, with p95 **1.657 s**, p99 **2.203 s**, no dropped iterations and no canceled requests. The highest error-free two-minute offered rate verified remains **2 requests/second**, up from **1** in the previous deployment's measurements. This is a measured result for the tested route mix, identity and dataset, rather than an exact system-wide ceiling or a count of concurrent people.

## Every tested level

| Series | Offered level | Scheduled seconds | Completed / started | Peak client in flight | HTTP 200 | Timeouts | 429 | Cancelled | p50 s | p95 s | p99 s | Successful completions/s | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| bursts | 1 burst requests | 30 | 1 / 1 | 1 | 1 | 0 | 0 | 0 | 1.360 | 1.360 | 1.360 | 0.549 | Complete |
| bursts | 5 burst requests | 30 | 5 / 5 | 5 | 5 | 0 | 0 | 0 | 1.860 | 2.573 | 2.631 | 1.669 | Complete |
| bursts | 10 burst requests | 30 | 10 / 10 | 10 | 10 | 0 | 0 | 0 | 2.475 | 6.224 | 6.336 | 1.482 | Complete |
| bursts | 20 burst requests | 30 | 20 / 20 | 20 | 20 | 0 | 0 | 0 | 2.752 | 7.056 | 7.307 | 2.587 | Complete |
| bursts | 50 burst requests | 30 | 50 / 50 | 50 | 50 | 0 | 0 | 0 | 3.485 | 5.796 | 5.990 | 7.692 | Complete |
| rates | 1 requests/s | 30 | 30 / 30 | 3 | 30 | 0 | 0 | 0 | 1.098 | 1.478 | 1.881 | 0.991 | Complete |
| rates | 2 requests/s | 30 | 61 / 61 | 6 | 61 | 0 | 0 | 0 | 1.216 | 1.718 | 2.088 | 1.970 | Complete |
| rates | 4 requests/s | 30 | 49 / 84 | 35 | 48 | 1 | 0 | 35 | 4.084 | 9.074 | 9.631 | — | Stopped / failed |
| confirmation | 2 requests/s | 120 | 241 / 241 | 6 | 241 | 0 | 0 | 0 | 1.161 | 1.686 | 1.895 | 1.989 | Complete |
| refine-3 | 3 requests/s | 30 | 91 / 91 | 14 | 91 | 0 | 0 | 0 | 2.879 | 5.251 | 5.672 | 2.713 | Complete |
| confirm-3 | 3 requests/s | 120 | 251 / 276 | 26 | 248 | 3 | 0 | 25 | 4.470 | 8.234 | 9.878 | — | Stopped / failed |
| refine-recovery | 2 requests/s | 60 | 120 / 120 | 5 | 120 | 0 | 0 | 0 | 1.216 | 1.657 | 2.203 | 1.979 | Complete |

The burst duration setting is a maximum; actual spans are in the JSON. Burst throughput is batch count divided by batch span and must not be called sustained throughput. Arrival-rate measurements include trailing responses but exclude setup/preflight. An iteration may occur on the scheduling boundary, causing counts such as 120 versus 121. Aborted rates are omitted because outstanding work was cancelled. HTTP-duration percentiles exclude connection establishment; cancelled requests have no completed-response duration. Timeout samples are capped by the deadline, and small-burst percentiles are descriptive rather than reliable population tails.

## Comparison with the previous deployment

| Matched stage | Previous p95 s | Current p95 s | Previous timeouts | Current timeouts |
| --- | ---: | ---: | ---: | ---: |
| bursts / 1 | 1.637 | 1.360 | 0 | 0 |
| bursts / 5 | 3.895 | 2.573 | 0 | 0 |
| bursts / 10 | 6.509 | 6.224 | 0 | 0 |
| bursts / 20 | 5.750 | 7.056 | 0 | 0 |
| bursts / 50 | 8.275 | 5.796 | 0 | 0 |
| rates / 1 | 2.155 | 1.478 | 0 | 0 |
| rates / 2 | 7.586 | 1.718 | 0 | 0 |
| rates / 4 | 8.833 | 9.074 | 1 | 1 |
| confirmation / 2 | 8.626 | 1.686 | 1 | 0 |

The workload and client safety thresholds match. Cold starts, server/provider conditions, cache state and normal user activity are not controlled, so differences cannot be assigned exclusively to one code change. Comparisons involving an aborted previous stage have different completed sample counts; outcomes and the complete tables above must be read with the percentiles.

## Runtime settings now observed

| Setting from backend timing header | Observed |
| --- | --- |
| `pool_max` | 1.0 |
| `redis_driver` | upstash-rest |
| `runtime_region` | iad1 |

The backend reports `iad1` as its runtime region and uses the Upstash REST driver. Its pool maximum is **one connection per process**. This is now live-header evidence, not an inference from source defaults. The visible web-routing identifier was `lhr1`; an edge-routing identifier does not by itself identify the web proxy function region. Actual deployed database/Redis endpoints and their regions remain unavailable from authenticated hosting settings. The earlier local `.env` database hint pointed to `eu-west-1`, but that is not independent proof of the live database endpoint.

## Sequential checks and stage timings

Two sequential rounds were collected before load, preserving the initial slow sample as well as repeats. The first member request included 374 ms JWT work and 410 ms profile work; it is not a warmed response. The second round is a single warm-repeat sample per route and is too small to establish a stable percentage gain. All samples are retained below.

| Round | Route | HTTP | Client total ms | App ms | Profile ms | Permissions ms | Rate limit ms | Revocation ms | Session ms | Cache read ms | Driver calls |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `/api/session` | 200 | 970 | — | — | — | — | — | — | — | — |
| 1 | `/api/backend/members` | 200 | 2194 | 1722 | 410 | 175 | 269 | 280 | 93 | — | 5 |
| 1 | `/api/backend/visitors` | 200 | 1251 | 841 | 73 | 0 | 228 | 233 | 74 | — | 6 |
| 1 | `/api/backend/services` | 200 | 1080 | 688 | 72 | 0 | 227 | 233 | 73 | — | 4 |
| 1 | `/api/backend/giving/transactions` | 200 | 1353 | 1050 | 72 | 0 | 232 | 232 | 72 | — | 9 |
| 1 | `/api/backend/reports/financial` | 200 | 1371 | 1070 | 72 | 0 | 226 | 231 | 73 | 231 | 6 |
| 2 | `/api/session` | 200 | 307 | — | — | — | — | — | — | — | — |
| 2 | `/api/backend/members` | 200 | 989 | 679 | 72 | 0 | 228 | 232 | 72 | — | 4 |
| 2 | `/api/backend/visitors` | 200 | 1178 | 873 | 72 | 0 | 226 | 231 | 72 | — | 6 |
| 2 | `/api/backend/services` | 200 | 1039 | 683 | 72 | 0 | 232 | 231 | 73 | — | 4 |
| 2 | `/api/backend/giving/transactions` | 200 | 1343 | 1040 | 73 | 0 | 232 | 232 | 72 | — | 9 |
| 2 | `/api/backend/reports/financial` | 200 | 1105 | 765 | 72 | 0 | 227 | 231 | 72 | 231 | 2 |

Warm profile hydration was around 72–73 ms, versus about 282 ms previously. The warm administrator catalogue lookup rounded to 0 ms. Warm cached report lookup was about 231 ms, versus about 452 ms previously. Warm member/service driver counts fell from seven to four; a cached financial report fell from five to two. These changes match the intended optimizations.

Rate limiting and revocation still each took roughly 226–233 ms in the sequential repeats. MFA/session approval around 72 ms now overlaps revocation rather than adding another serial delay. The pool remains one connection, so relation-heavy reads can still queue; sampled waiting values reached five for giving even in the sequential diagnostics. These are observed samples, not continuous maximum queue counts. Driver and stage durations overlap and are not additive. The absolute next capacity bottleneck cannot be identified from these samples alone without correlated pool/provider/server telemetry.

## Evidence and cleanup

Sanitized request counts, endpoint outcomes, timestamps, per-stage errors, drop counts and setup-independent throughput: [LIVE-CAPACITY-AUTH-CACHE-2026-10-24.json](LIVE-CAPACITY-AUTH-CACHE-2026-10-24.json). The earlier reports remain unchanged. Raw logs and token-free traces are under ignored `test/load/results/live-auth-cache-*`. Existing rate limits, subscription and branch permissions, normal JWT/revocation and MFA/session checks remained enabled. The generated private session file is removed at the end of testing, while the user-managed private credential file is retained.
