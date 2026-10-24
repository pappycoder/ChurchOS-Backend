# Local fixture baseline — 24 October 2026

These figures are not the live deployment. The local fixture baseline ran on a shared 8-logical-CPU Intel i7-1185G7 host reporting 32.8 GB memory, Node 22.23.2 and PostgreSQL 18.6. The PostgreSQL pool limit was 10; the local API, database and k6 shared the machine. Ten fictional churches contained 10,000 members, 2,000 visitors, 10,000 giving transactions and 30 services. The server used real application services/Prisma/SQL with test-only routing and fixture sessions. Production authentication, controllers, guards, Redis, remote database/network, web proxy and Vercel were excluded. No production records were used or changed. Fixtures were removed and the local server/database stopped.

The local default criteria were p95 < 1 second and p99 < 2 seconds, <1% errors, >99% checks, no 429/auth failures, and zero dropped iterations. All local HTTP error rates were zero. Failed stages therefore reflect latency and/or dropped work. Rate is the older raw k6 rate including setup; offered rate and scheduled duration are provided to avoid overstating precision. Handler peaks include preflight activity.

The strongest sustained local result was **400 offered requests/second for 120 seconds**, with p95 **110.185 ms** and zero dropped work. A short 425-request/second pass did not repeat over 120 seconds: p95 reached 4.036 seconds with 1,217 dropped iterations. Six hundred synthetic active users (one sequential GET plus a one-second pause each) passed a 60-second local confirmation, but these fixture sessions are not distinct live identities.

| Series | Mode | Level | Seconds | Requests | Raw completed RPS including setup | p50 ms | p95 ms | p99 ms | Peak handlers | Dropped | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| confirm-rps | offered RPS | 425 | 120 | 49784 | 406.492 | 1723.083 | 4035.637 | 4294.950 | 850 | 1217 | Fail |
| confirm-users | active fixture users | 600 | 60 | 25533 | 413.507 | 357.222 | 925.328 | 1159.030 | 337 | 0 | Pass |
| inflight | no-pause workers | 10 | 20 | 9792 | 479.243 | 18.057 | 35.397 | 47.384 | 10 | 0 | Pass |
| inflight | no-pause workers | 25 | 20 | 9676 | 474.311 | 45.102 | 98.533 | 124.549 | 25 | 0 | Pass |
| inflight | no-pause workers | 50 | 20 | 9775 | 476.549 | 89.137 | 211.504 | 242.282 | 50 | 0 | Pass |
| inflight | no-pause workers | 100 | 20 | 9014 | 440.121 | 185.508 | 469.707 | 548.477 | 100 | 0 | Pass |
| inflight | no-pause workers | 200 | 20 | 9272 | 445.475 | 395.458 | 906.905 | 1111.810 | 200 | 0 | Pass |
| inflight | no-pause workers | 400 | 20 | 9504 | 447.681 | 780.060 | 1828.291 | 2460.365 | 400 | 0 | Fail |
| refine-rps | offered RPS | 425 | 60 | 25501 | 422.552 | 7.720 | 52.362 | 94.573 | 46 | 0 | Pass |
| refine-rps | offered RPS | 450 | 60 | 27001 | 441.354 | 534.791 | 1493.091 | 2012.031 | 540 | 0 | Fail |
| refine-users | active fixture users | 500 | 30 | 12940 | 409.983 | 118.533 | 497.444 | 1002.541 | 159 | 0 | Pass |
| refine-users | active fixture users | 600 | 30 | 12776 | 402.291 | 375.780 | 948.512 | 1134.273 | 303 | 0 | Pass |
| refine-users | active fixture users | 700 | 30 | 13281 | 415.859 | 512.941 | 1328.670 | 1730.549 | 441 | 0 | Fail |
| rps | offered RPS | 100 | 30 | 3001 | 98.786 | 5.723 | 15.806 | 21.574 | 4 | 0 | Pass |
| rps | offered RPS | 200 | 30 | 6001 | 197.841 | 7.675 | 20.202 | 33.031 | 11 | 0 | Pass |
| rps | offered RPS | 300 | 30 | 9001 | 297.050 | 8.432 | 35.989 | 54.226 | 15 | 0 | Pass |
| rps | offered RPS | 400 | 30 | 12000 | 395.791 | 13.958 | 69.008 | 118.992 | 40 | 0 | Pass |
| rps | offered RPS | 500 | 30 | 13845 | 425.355 | 1354.621 | 4495.011 | 4680.449 | 1000 | 1155 | Fail |
| sustained-rps | offered RPS | 350 | 120 | 42001 | 348.542 | 19.088 | 70.569 | 124.215 | 69 | 0 | Pass |
| sustained-rps | offered RPS | 400 | 120 | 48000 | 399.189 | 23.695 | 110.185 | 199.761 | 84 | 0 | Pass |
| users | active fixture users | 10 | 30 | 300 | 9.733 | 7.099 | 21.059 | 82.943 | 5 | 0 | Pass |
| users | active fixture users | 50 | 30 | 1500 | 48.206 | 8.603 | 47.781 | 153.824 | 22 | 0 | Pass |
| users | active fixture users | 100 | 30 | 3000 | 95.885 | 9.667 | 61.826 | 222.482 | 28 | 0 | Pass |
| users | active fixture users | 200 | 30 | 5924 | 189.033 | 14.117 | 86.440 | 321.292 | 44 | 0 | Pass |
| users | active fixture users | 400 | 30 | 11552 | 368.521 | 31.055 | 133.188 | 654.821 | 63 | 0 | Pass |
| users | active fixture users | 800 | 30 | 13691 | 427.162 | 741.543 | 1608.456 | 1778.086 | 647 | 0 | Fail |

Full aggregate server telemetry and results: [LOCAL-CAPACITY-2026-10-24.json](LOCAL-CAPACITY-2026-10-24.json). Live findings: [LIVE-CAPACITY-2026-10-24.md](LIVE-CAPACITY-2026-10-24.md).
