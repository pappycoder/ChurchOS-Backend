# Security, performance and experience audit rollout

## Implemented

- Signed identity verification precedes tenant queries; issuer/audience are constrained. Middleware and guards share JWT verification/profile hydration.
- All password sessions now need a persisted, session-bound backend approval; authenticator sessions retain revision checks. Revocation covers sessions with and without 2FA. Refresh accepts expired access tokens without treating infrastructure errors as invalid credentials. Password recovery consumes the actual single-use recovery token and invalidates existing approvals.
- Web browser credentials move to HttpOnly, Secure production cookies through a same-origin Next API proxy. Tokens are removed from browser JSON. Client/session caches are cleared on account changes; private pages/API/RSC are excluded from service-worker caching.
- Sync reads/writes enforce tenant, permission, branch and ownership scopes. Privileged financial/ticket/check-in writes must use domain APIs. Bootstrap/pull are bounded, deterministic and paginated. Mutation fingerprints are scoped to the user and operation; marking synced no longer suppresses other devices.
- Restricted managed media uses a private bucket and authenticated delivery, including branch checks, restricted-media permission and range requests. Public branding remains public. Storage-path deletion requires a managed tenant-owned record. Upload byte limits, signatures and decoded-image pixel limits are enforced.
- Webhook delivery accepts only public HTTPS destinations, validates all DNS answers, pins the chosen address, rejects redirects and limits time/response size. Anonymous forms are throttled; sensitive requests fail closed when the shared production limiter is unavailable.
- Appointment lists batch related lookups. Cache keys include route, query, viewer permissions and scope; write responses await church cache-version changes. Query counts and timings are recorded without SQL/bound values. Telemetry excludes raw request bodies and headers; replay is opt-in with masking.
- Serverless APIs do not run queue processors/schedulers. A persistent worker entry point runs them with bounded concurrency.
- Nest 11/Express 5 and supporting libraries updated; wildcard route and query parser compatibility addressed. npm and pnpm backend locks synchronized.
- Web retries preserve page state; skeletons, actual request indicators, content-image fallbacks, keyboard table scrolling, skip navigation and form draft protection are shared. Artificial upload progress and hover data prefetch removed. Spreadsheet parsing runs in a bounded worker, CSV formulas are escaped, and imports use sequential validated batches with partial-failure feedback.

## Required deployment sequence

No live database or storage changes are performed by builds. Deploy backend and web together; browser token handling changed.

1. Back up the database and storage metadata. Review migration `20261010200000_audit_performance_security`. Apply earlier pending authenticator migrations first as part of the normal migration chain.
2. Configure a dedicated `PASTORAL_ENCRYPTION_KEY` and retain an existing strong key unchanged. If old notes used a different/default key, stop all note writers, provide that key as `PASTORAL_OLD_ENCRYPTION_KEY`, run `npm run pastoral:rotate-key` for a dry run, then `npm run pastoral:rotate-key -- --apply`. Resume only after configuring the new key on every instance. The tool handles already-rotated rows and never logs plaintext. Do not lose either key or the backup.
3. Configure `SUPABASE_PRIVATE_STORAGE_BUCKET=media-private`, `WEB_URL` to the web origin, the existing authenticator encryption key, and Resend sender/API credentials for recovery emails. Keep the public branding bucket separate. Set an identical random `INTERNAL_PROXY_SECRET` (at least 32 characters) on backend and web. On Vercel the proxy forwards its platform-provided client IP only with this secret. Other hosts must supply a trusted client-IP header in their proxy integration; otherwise anonymous requests share the proxy IP budget.
4. Run `npx prisma migrate deploy` and `npm run prisma:seed-perms`. The latter adds `media:restricted:read` and updates the catalog without demo data. Permission cache namespace is bumped to `perms:v13`; custom permissions remain separate.
5. Deploy the API and web, with web server `API_URL` pointing to the backend origin (no `/api/v1` suffix). All users must sign in again: earlier password sessions lack the new local approval. Supabase remains the identity provider; backend authenticator enforcement remains local.
6. Run `npm run storage:migrate-private` for a dry run. Review the managed records, then run `npm run storage:migrate-private -- --apply`. This copies bytes and transactionally rewrites known member/profile/asset/sermon/form references. Review delivery, then run `npm run storage:migrate-private -- --apply --prune-public` to remove public originals. Restriction is incomplete until public originals are pruned. The tool resumes after partial failures. Stop file/record writers during migration. Unmanaged historical objects and links in integrations, emails, arbitrary custom JSON or previously distributed URLs require a separate inventory; the tool stops on unmanaged paths rather than guessing.
7. Deploy a persistent worker using `npm run build` then `npm run start:worker`; use `ENABLE_QUEUE_WORKERS=false` on HTTP instances and a small worker `DB_POOL_MAX` such as 2. Use Redis compatible with BullMQ. The worker enables processors and scheduling itself. Without it, queued messaging, broadcasts and scheduled giving will wait.
8. Confirm login, MFA/recovery, revocation, permission/branch views, private upload/playback/delete, queues and exports in the target environment. Review DB/query metrics and pool limits under representative load. Compilers/builds do not establish runtime behavior or measured latency improvements.

## Offline client contract

Bootstrap returns at most 100 rows per collection and `nextCursors`. Keep the *initial* bootstrap revision while paging each entity with its ID cursor, then pull from that revision to catch changes during bootstrap. Pull returns an opaque `v2:` cursor ordered by `(created_at,id)`; persist the returned cursor only after applying the whole page. Empty scoped pages may still have `hasMore=true`; continue. Legacy timestamps are replay-safe and can repeat rows.

Device IDs are namespaced by profile. Clear local collections and bootstrap again when tenant, account, branch or effective permissions change. A branch tombstone can resolve a surviving parent relation; after a parent is removed, its old scope cannot be inferred safely, so rebootstrap rather than retaining orphan records. Own bookmarks require a linked member. Financial, registration and attendance offline writes are intentionally rejected and must go through normal domain endpoints. Mobile sync consumers need this protocol upgrade before relying on the new pagination behavior.

## Dependency and validation limits

Production dependency audits report zero known vulnerabilities. The remaining development advisories propagate from `braces` (published latest 3.0.3 has no patched release at audit time); it is used by local lint/build/test glob tools, not production API handlers. Do not expose development tool servers publicly. Vitest and its worker tooling are updated; no test suites were executed for this implementation.

Both production builds, frontend type checking and frontend lint, and lint/type checking of changed backend source pass. Existing `scripts/delete-data.ts` has unrelated TypeScript errors when checking the entire maintenance-scripts project; the new migration/rotation scripts compile separately. Live migrations, permissions seed, media pruning, key rotation, browser accessibility checks, load measurements and target-host integration checks remain deployment work.

Media accepts 5 MB images/50 MB other files, subject to host request-size limits. Vercel function ingress can impose a lower limit; larger files need a persistent upload host or direct-to-storage upload flow. This rollout does not change those platform limits.

The seeded login selector is intentionally retained for ongoing testing.
