# AGENTS.md — ChurchOS Backend

> This file documents the ChurchOS Backend project for AI coding agents and developers.
> It describes the project's purpose, architecture, conventions, and must be updated with every change.

---

## Project Overview

**ChurchOS Backend** is the REST API server for the ChurchOS platform — a Church Management & Digital Ministry system built for Nigerian churches. It handles all server-side business logic, database operations, authentication, payment processing, and third-party integrations.

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | NestJS 10 (TypeScript) |
| ORM | Prisma 7 (PostgreSQL) |
| Auth | Supabase Auth (JWT ES256 via JWKS, MFA) |
| Validation | class-validator + class-transformer |
| API Docs | Swagger / OpenAPI 3.0 |
| Payments | Paystack, Flutterwave |
| WhatsApp | 360dialog Business API |
| Email | Resend |
| SMS | Termii |
| Cache/Queue | Redis (ioredis + BullMQ) |
| Image Processing | sharp (WebP optimization) |
| File Upload | Supabase Storage + multer |
| Monitoring | Sentry, Logtail |

### Key Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run start:dev      # Start in watch mode
npm run start:prod     # Start compiled production build
npm run lint           # ESLint + Prettier
npm run test           # Jest unit tests
npx prisma generate    # Regenerate Prisma Client after schema changes
npx prisma migrate dev # Create a new migration
npx prisma studio      # Visual database browser
npx prisma db seed     # Seed database with dev data
npm run prisma:seed    # Alternative seed command
```

## Architecture

### Module Structure

```text
src/
├── main.ts                 # Application bootstrap, Swagger, CORS, ValidationPipe, ExceptionFilter
├── app.module.ts           # Root module — imports ConfigModule, PrismaModule
├── config/                 # Environment config, validation schema
│   ├── env.validation.ts   # Zod schema for env vars (validated at startup)
│   └── index.ts            # Barrel exports
├── prisma/                 # Prisma ORM integration (global module)
│   ├── prisma.module.ts    # Global PrismaModule registration
│   ├── prisma.service.ts   # PrismaService with lifecycle hooks (connect/disconnect)
│   └── index.ts            # Barrel exports
├── common/                 # Shared guards, interceptors, decorators, filters
│   ├── common.module.ts    # Global module (AuditLoggingService)
│   ├── decorators/         # @CurrentUser, @RequireRoles, Swagger helpers
│   ├── filters/            # GlobalExceptionFilter
│   ├── interceptors/       # LoggingInterceptor (registered globally)
│   └── services/           # AuditLoggingService
├── supabase/               # Supabase client wrapper (global)
├── auth/                   # Authentication & authorization (Supabase Auth, MFA)
│   ├── guards/             # JwtAuthGuard (jose JWKS), RolesGuard
│   ├── services/           # JwksService
│   └── decorators/         # @RequireRoles()
├── config/                 # Environment config, validation schema (Zod)
├── prisma/                 # Prisma ORM integration (global module + service)
├── members/                # Member CRUD, search, bulk import, CSV/XLSX export, QR codes
├── attendance/             # Service attendance, check-in (QR, WhatsApp, manual)
├── giving/                 # Giving categories, multi-gateway payments, cash/bank, PDF receipts, webhooks
├── events/                 # Event CRUD, free/paid registration, multi-tier ticketing, payment webhook, ticket validation
├── sermons/                # Sermon archive CRUD, search, speaker/series/tag/date-range filtering
├── whatsapp/               # WhatsApp 360dialog webhooks, command router, outbound messaging
├── communication/          # Resend email service + Termii SMS service, Message table logging
├── media/                  # File uploads, image optimization, media library browsing
├── profile/                # Profile CRUD, photo upload, role management, MFA, soft-delete
├── church/                 # Church CRUD, config, staff invitation/management
├── branches/               # Branch CRUD, multi-tenant scoping
├── family/                 # Family CRUD, member associations, head-of-family tracking
├── templates/              # Message template CRUD, channel/status/search filters (WhatsApp/SMS/Email)
├── broadcast/              # Broadcast campaigns with audience filtering and queue dispatch
├── queues/                 # BullMQ queue infrastructure, 7 named queues, processors
│   ├── queues.module.ts    # BullModule config, Redis connection, graceful shutdown
│   └── processors/         # WhatsApp, Email, SMS, RecurringGiving, NightlyJobs, WebhookDelivery, DeadLetter
├── pastoral/               # Pastoral notes (AES-256-GCM), life events, engagement & risk scoring
│   ├── pastoral.service.ts # CRUD + encryption + confidentiality access control
│   ├── scoring.service.ts  # Engagement & risk score calculation engines
│   └── dto/                # CreatePastoralNote, LifeEvent, List DTOs
├── admin/                  # Department CRUD, cell group CRUD, dashboard endpoints
│   ├── admin.service.ts    # Department/CellGroup CRUD, Haversine nearest-group
│   └── dto/                # CreateDepartment, CreateCellGroup, Response DTOs
├── assets/                 # Asset & inventory management
│   ├── assets.module.ts    # AssetsModule
│   ├── assets.service.ts   # Asset CRUD, maintenance, depreciation, loans, QR, scans
│   ├── assets.controller.ts# 21 REST endpoints for asset management
│   └── dto/                # Asset, category, maintenance, depreciation, loan, scan DTOs
├── forms/                  # Form & submission management
│   ├── forms.module.ts     # FormsModule
│   ├── forms.service.ts    # Form CRUD, submissions, validation, approvals, cloning
│   ├── forms.controller.ts # Authenticated form endpoints
│   ├── forms-public.controller.ts # Public submission endpoint
│   └── dto/                # Form, field, submission, approval DTOs
├── users/                  # User/staff management (Supabase Auth admin)
│   ├── users.module.ts     # UsersModule
│   ├── users.service.ts    # User CRUD, invite, deactivate, reset password, force sign-out
│   ├── users.controller.ts # 7 endpoints for user management
│   └── dto/                # UserResponse, InviteUser, ListUsers DTOs
├── notifications/          # In-app notification management
│   ├── notifications.module.ts  # NotificationsModule
│   ├── notifications.service.ts # Notification CRUD, unread count, broadcast
│   ├── notifications.controller.ts # 4 endpoints for notifications
│   └── dto/                # NotificationResponseDto
├── sync/                   # Offline data synchronization
│   ├── sync.module.ts      # SyncModule
│   ├── sync.service.ts     # Push/pull sync, idempotency, conflict resolution
│   ├── sync.controller.ts  # 3 endpoints for sync
│   └── dto/                # SyncPushDto, SyncChangeDto
├── reports/                # Church report generation (financial, attendance, members)
│   ├── reports.module.ts   # ReportsModule
│   ├── reports.service.ts  # Aggregation queries scoped by church_id + date ranges
│   ├── reports.controller.ts # 4 endpoints for reports
│   └── dto/                # ReportQueryDto, FinancialReportDto, AttendanceReportDto, MemberReportDto
├── webhooks/               # Outbound webhook subscriptions + delivery
│   ├── webhooks.module.ts  # WebhooksModule
│   ├── webhooks.service.ts # Subscription CRUD, notifySubscribers(), BullMQ dispatch
│   ├── webhooks.controller.ts # 5 endpoints for webhook management
│   ├── webhook-delivery.processor.ts # HMAC-SHA256 signed delivery, 3 retries
│   └── dto/                # CreateWebhookSubscriptionDto, WebhookResponseDto
├── health/                 # Health check endpoint (DB, Redis, all 8 queues)
│   ├── health.module.ts    # Imports QueuesModule + WebhooksModule
│   └── health.controller.ts# GET /health — per-queue job count metrics
└── supabase/               # Supabase client (Auth + Storage only) [PLANNED]
```

### Conventions

- **All API routes** are prefixed with `/api/v1`.
- **DTOs** use `class-validator` decorators for automatic validation via `ValidationPipe`.
- **Prisma queries** must always scope by `church_id` for multi-tenant data isolation.
- **Response format** is standardized: `{ success: true, data: ..., message: ... }`.
- **Error format** is standardized: `{ success: false, error: { code, message, details, timestamp, path, method } }`.
- **File naming** uses kebab-case for files, PascalCase for classes.
- **Modules** follow the NestJS convention: `*.module.ts`, `*.service.ts`, `*.controller.ts`, `*.dto.ts`, `*.entity.ts`.
- **Environment variables** are validated at startup via Zod schema in `src/config/env.validation.ts`.
- **Swagger decorators** use reusable helpers from `src/common/decorators/` (e.g., `@ApiCreateEndpoint()`).
- **File uploads**: Use `MediaService` for all file uploads. Images are auto-optimized to WebP (quality 80, max 1200px). When updating an image URL, the old image is deleted from storage in the same transaction.
- **Multi-tenancy**: Branch CRUD queries scope by `church_id`. Branch deletion is blocked if members exist.

### Database

- PostgreSQL 16 via Prisma ORM 7.
- Schema defined in `prisma/schema.prisma` (26+ models, 8 enums).
- All tables use UUID primary keys.
- Snake_case column names via `@@map()`.
- Multi-tenant isolation enforced via `church_id` on all queryable models.
- Prisma 7 uses `@prisma/adapter-pg` driver adapter for connection management.

### Environment Variables

Copy `.env.example` to `.env`. All variables are validated at startup via Zod schema.

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | Yes | `development`, `production`, or `test` |
| `PORT` | Yes | Server port (default: 3001) |
| `WEB_URL` | Yes | Frontend URL for CORS |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side Supabase key |
| `SUPABASE_ANON_KEY` | Yes | Client-side Supabase key |
| `SUPABASE_JWT_SECRET` | No | Legacy HS256 secret (optional — ES256 tokens verified via JWKS) |
| `REDIS_URL` | Yes | Upstash Redis connection |
| `PAYSTACK_SECRET_KEY` | No | Paystack payment processing |
| `FLUTTERWAVE_SECRET_KEY` | No | Flutterwave payment processing |
| `360DIALOG_API_KEY` | No | WhatsApp Business API |
| `RESEND_API_KEY` | No | Email delivery |
| `TERMII_API_KEY` | No | SMS fallback |
| `ENABLE_SMS_FALLBACK` | No (default: `false`) | Enable SMS fallback when WhatsApp delivery fails |
| `OPENAI_API_KEY` | No | AI chatbot features |
| `SUPABASE_STORAGE_BUCKET` | No (default: media) | Supabase Storage bucket name for file uploads |
| `MAX_FILE_SIZE_MB` | No (default: 5) | Maximum upload file size in megabytes |

## Related Projects

- **ChurchOS-Web** — Next.js 14 PWA frontend (`../ChurchOS-Web/`)
- **ChurchOS-Mobile** — Flutter mobile app (`../ChurchOS-Mobile/`)
- **GitHub Project Board** — [https://github.com/orgs/pappycoder/projects/2](https://github.com/orgs/pappycoder/projects/2)

---

## Changelog

All notable changes to this project are documented below. Update this section with every change.

### [Unreleased]

- **2026-08-23** — TODO markers for upcoming integrations.
  - Profile photo upload: bucket provisioning/policy check needed before production (`uploadProfilePhoto`).
  - Member invite + forgot password: swap Supabase default emails for branded Resend sends (invite details; reset link via `admin.generateLink`).

- **2026-08-23** — Change password fix (wrong "current password incorrect" errors).
  - **Root cause**: `changePassword` verified the current password by signing in with the **email from the JWT claim** (`user.email || ''`) — stale after email changes (e.g. via the new self-service edit) or empty when absent, so correct passwords were rejected. It then set the new password via `auth.updateUser()`, which depended on the shared service-role client retaining an in-memory user session.
  - **Rewrite** (`auth.service.ts`): resolves the authoritative account email via `admin.getUserById(userId)` (500 "Unable to verify your account" if none), verifies via `signInWithPassword`, sets the new password deterministically via `admin.updateUserById(userId, { password })`, and revokes existing sessions with `admin.signOut(userId)` (non-fatal on failure; access tokens stay valid until expiry so the current device isn't dropped mid-session). Real Supabase error messages are now logged server-side for diagnosability; the controller no longer passes the JWT email.
  - **Tests**: suite green at 511 passing / 35 suites (+1): success path asserts admin-resolved email + admin password update + session revocation, wrong-password short-circuits before any update, unresolvable email → 500 without sign-in attempt, update failure → 500.

- **2026-08-23** — Profile email completeness (self-service edit + data backfill).
  - **Root cause found**: `registerUser` never persisted email anywhere in Postgres — Church was created with only name/denomination and Profile with only names/phone, so legacy self-registered rows had `profiles.email = NULL` and every read endpoint omitted the field. Invites already persisted email (Aug-16 fix); admin edit already synced Supabase.
  - **Registration** (`auth.service.ts`): church create now writes `email: dto.email` (church contact email) and profile create writes `email: dto.email`.
  - **Self-service email edit**: `UpdateProfileDto` gains optional validated `email`; `updateMyProfile` mirrors the admin-edit pattern — when changed, syncs via `supabase.auth.admin.updateUserById(user_id, { email })` first (BadRequest on failure), then persists to `profiles.email`. Unchanged emails skip the auth call.
  - **Safety-net hydration**: `getMyProfile` hydrates a NULL/empty email from Supabase Auth (`admin.getUserById`) once and persists it, so legacy accounts self-heal on first /me fetch without N+1 calls on list endpoints.
  - **Backfill script** `scripts/backfill-profile-emails.ts` (+ `npm run backfill-profile-emails`): idempotent one-time maintenance — pages all Supabase Auth users, fills missing profile emails, then heals legacy churches missing a contact email using their earliest church_admin's email. Run against dev: 2/3 profiles healed (1 orphaned profile has no auth user); churches already populated.
  - **Tests**: suite green at 510 passing / 35 suites (+4): /me hydration persists email, self-service email syncs+persists, unchanged email skips Supabase, Supabase rejection → BadRequest with no DB write.

- **2026-08-22** — Role display labels (fix: custom roles showed as slugs).
  - **Schema/migration** `20260822010000_role_label`: `roles.label TEXT` nullable column; backfills all 8 templates with canonical labels and title-cases church-owned slugs (`media_team` → "Media Team"). Previously the friendly label was discarded at creation — only the slugified `name` was persisted.
  - **APIs**: `createRole` now persists `label`; `getRolesSummary`/`getRolePermissions` return it (`RoleWithPermissions.label`, Swagger on `RolePermissionsResponseDto`); profile detail `roles[]` includes `label` (church-owned record preferred when a name is shadowed).
  - **Tests**: suite green at 506 passing / 35 suites (createRole asserts label persisted + echoed).

- **2026-08-22** — Per-church custom roles.
  - **Schema**: `Role.church_id String?` + FK to `Church` (`onDelete: Cascade`), `@@unique([church_id, name])`, `@@index([church_id])`, `Church.roles` back-relation (migration `20260822000000_per_church_custom_roles`). Seeded templates keep `church_id = null`; church-owned roles are per-tenant and deleted with their church. A church-owned role **shadows** a same-named global template for that church.
  - **Permission resolution**: global templates = seed defaults ∪ additive `ChurchRolePermission` overrides; owned roles = absolute set in `RolePermission`. `getRolePermissions` now returns `isChurchOwned` and throws 404 when neither exists; profile.service Role lookups are scoped `OR [{church_id}, {church_id: null}]`.
  - **New endpoint**: `POST /church/roles` (`CreateRoleDto`: label 3–50, description ≤200 optional, permissionIds optional) — slugifies the label ("Media Team" → `media_team`, `ROLE_NAME_PATTERN`), rejects reserved names (the 8 seeded roles) and duplicates with 409s, validates permission IDs, audit-logs CREATE. Guarded church_admin/super_admin.
  - **Guardrails**: `super_admin` immutable everywhere; editing the `church_admin` template still requires the protected core permissions; reset-to-defaults is rejected for owned roles (nothing to reset); saves invalidate the `perms:{churchId}:{roleName}` Redis key.
  - **Tests**: suite green at 506 passing / 35 suites — new `permissions.service.spec.ts` covers createRole paths (slugify/reserved/duplicate/bad-slug/unknown ids), template vs owned resolution, shadowing, absolute-replace saves, church_admin protection, reset rules, cross-role union, and catalog caching.

- **2026-08-22** — Multi-role profiles (native array) + admin user-edit APIs.
  - **`Profile.role` is now `String[]`** (migration `20260821120000_profile_role_array`: `USING ARRAY["role"]::text[]`, default `ARRAY['member']::text[]`). Roles are stored **rank-descending**; `role[0]` is the primary. `ROLE_RANK`: super_admin 100, senior_pastor 80, church_admin 60, branch_pastor 50, secretary/treasurer/department_head 40, member 10. Scalar-list queries: `role: { has: x }` for single-match filters, `{ hasSome: [...] }` for any-of checks (admin.service, events.service, members.service, pastoral/scoring.service).
  - **Permissions union**: `PermissionsService.getUserPermissions(churchId, roleNames: string | string[])` merges permissions across all of a profile's roles (per-role Redis cache preserved). `RolesGuard`/`PermissionsGuard` read the raw `profile.role` array; request-context middleware exposes `request.profile.role` as the primary string plus a `roles: string[]` array.
  - **New endpoints** (`profiles.controller`, guarded by super_admin/senior_pastor/church_admin): `PATCH /profiles/:id/roles` replaces the full role set (validates against VALID_ROLES via Role table lookup, blocks self-changes unless no-op, rejects roles above caller rank, requires super_admin to grant/edit super_admin holders, audit-logs old/new sets) and `PATCH /profiles/:id` admin edit (names/email/phone/branch/status; branch must belong to the same church; email changes sync through Supabase admin API; self-deactivation and non-super_admin edits of super_admins blocked).
  - **Detail response enrichment**: GET `/profiles/:id` returns all roles with descriptions, effective permissions grouped by resource with `grantedBy` roles (`super_admin` → every permission), `lastSignInAt` from Supabase admin API, and a linked `member` summary when one exists.
  - **All DTOs return full arrays**: ProfileResponseDto/RegisterResponseDto/session/staff response `role` fields are `string[]`; invite/register/staff-create write single-element arrays (`['church_admin']`, `[dto.role]`); removeStaff writes `['removed']`.
  - **Seeds**: profiles.seed.ts and seed-super-admin.ts updated for array roles (`{ has }` lookups, super_admin prepended to existing set).
  - **Tests**: suite green at 485 passing / 34 suites — new coverage for multi-role assignment ordering, unknown-role/rank/self-change rejections, admin edit guards, Supabase email sync.

- **2026-08-16** — Offline sync completion + backend production hardening (Phase 1 round-up).
  - **Sync outbox DB triggers**: New migration `20260816110600_sync_outbox` adds `sync_outbox_event()` (SECURITY DEFINER) plus AFTER INSERT/UPDATE/DELETE triggers on `members`, `services`, `attendance`, `giving_categories`, `transactions`, `event_registrations`, `sermon_bookmarks`, `life_events`, `visitors`. Table→entity mapping: `members`→`member`, `services`→`service`, `attendance`→`attendance`, `giving_categories`→`givingCategory`, `transactions`→`transaction`, `event_registrations`→`eventRegistration`, `sermon_bookmarks`→`sermonBookmark`, `life_events`→`lifeEvent`, `visitors`→`visitor`. Payload is `to_jsonb(COALESCE(NEW, OLD))`. Suppression via transaction-local GUC `set_config('app.sync_outbox.skip', 'true', true)`.
  - **`church_id` backfill**: `EventRegistration` and `SermonBookmark` gained `church_id` (backfilled from `events.church_id` / `members.church_id`) in migration `20260816110526_add_sync_devices_and_church_scope`. Create call sites updated in `events.service.ts` (2) and `sermons.service.ts` (1). This also fixes a latent bug where `applyChange` wrote `church_id` to tables lacking the column.
  - **`SyncDevice` model**: New `sync_devices` table (church-scoped, `@@unique([church_id, device_id])`, indexed by cursor) tracking the last-pull watermark per device.
  - **`SyncService.pullChanges` rewrite**: Signature is now `(churchId, deviceId, limit=100, cursor?)`. Gets-or-creates the device watermark, queries changes after the cursor (client-provided cursor takes precedence over the stored low watermark), hydrates create/update changes to live camelCase rows via per-entity mappers, returns tombstones (`data: null`) for deletes and for records that no longer exist, and returns a `cursor` for the next pull. Client headers: `X-Device-Id` (default `web`). Pull response `data` is now nullable.
  - **`SyncService.pushChanges`**: Applies device-originated changes inside a transaction that first sets the outbox-skip GUC, preventing double-queueing from DB triggers. `cleanupExpiredChanges(churchId)` purges synced rows older than 30 days and any row older than 90 days, wired into the nightly job.
  - **Cache invalidation (fix)**: Redis `get` keys now embed a church-scoped cache version (`cache:ver:{churchId}`). New `CacheVersionInterceptor` (registered globally via `APP_INTERCEPTOR`) bumps the version (fire-and-forget, 24h TTL) after any successful non-GET mutation, so dashboard/analytics reads can no longer serve stale data for up to 10 minutes. Added `RedisService.incr(key, ttlSeconds)`.
  - **Nightly job cleanup**: `NightlyJobsProcessor` now injects `SyncService` and calls `cleanupExpiredChanges`, returning `syncQueuePurged` in its result.
  - **Docker HEALTHCHECK**: Production image now health-checks `/api/v1/health` via busybox wget (30s interval, 20s start period, 3 retries).
  - **E2E tests**: New `test/e2e/db-triggers.e2e-spec.ts` (raw pg: entity/action mapping, ordering, GUC suppression — each test runs in a rolled-back transaction) and `test/e2e/sync.e2e-spec.ts` (real Prisma + SyncService: bootstrap, hydration, tombstones, watermark advance, push apply + outbox suppression, cleanup). CI gains an `e2e` job that runs `prisma migrate deploy` against a dedicated `churchos_e2e` Postgres service before `npm run test:e2e`.
  - **Processor/service specs**: Added `test/unit/webhooks/webhooks.service.spec.ts` (6 tests), `test/unit/webhooks/webhook-delivery.processor.spec.ts` (3 tests, HMAC signature verification), `test/unit/queues/dead-letter.processor.spec.ts` (1 test), and `test/unit/queues/nightly-jobs.processor.spec.ts` (7 tests incl. NDPR purge + sync cleanup). Sync spec updated for the new pull/watermark/GUC behavior (16 tests).
  - **Tests**: 476 unit tests across 34 suites, plus 10 e2e tests. Build clean, lint clean (0 errors).

- **2026-08-16** — Queue migration, security hardening, and offline sync apply/bootstrap.
  - **Queue Migration (@nestjs/bull → @nestjs/bullmq)**: All 8 processors (`nightly-jobs`, `whatsapp-outbound`, `email-outbound`, `sms-outbound`, `recurring-giving`, `broadcast`, `dead-letter`, `webhook-delivery`) migrated from `@nestjs/bull` `@OnQueueFailed`/`@OnQueueCompleted` decorators to `WorkerHost` subclasses with a single `process(job)` switching on `job.name`, plus `@OnWorkerEvent('failed')`/`@OnWorkerEvent('completed')`. `queues.module.ts` forRootAsync now passes `connection: { url }` (bullmq v5 option) and `maxRetriesPerRequest: null`. Removed the `@nestjs/bull` dependency. This fixes the runtime crash where `updateProgress`/`updateData`/`moveToFailed` didn't exist on the decorated-method jobs.
  - **Cross-tenant cache leak (fix)**: `cache.interceptor.ts` `buildCacheKey` now includes `church_id` (from `profile?.church_id || 'global'`) so cache entries for one church can never be served to another.
  - **NDPR purge (fix)**: `purgeExpiredNdprData` now runs inside `prisma.$transaction` with correct FK ordering — nulls optional FKs (`profile.member_id`, `assetLoan.borrower_member_id`, `visitor.converted_member_id`) before deleting required-FK children, then members. Audit-log purge (2y) stays outside the transaction.
  - **Profile role/no-op fixes**: Added `ROLE_RANK` hierarchy and `updateProfileRole(..., adminRole)` escalation guards (only `super_admin` may assign `super_admin`; nobody can assign a role above their own rank). `softDeleteProfile` and `deactivateUser` now persist `status: 'inactive'` (previously no-ops); `deactivateUser` also invalidates sessions via `supabase.auth.admin.signOut(userId)` (removed the no-op `ban_duration: 'none'` update). `resetUserPassword` now uses `supabase.auth.resetPasswordForEmail()` (the magiclink `generateLink` generated a link but never sent an email). `inviteUser` now checks email/phone duplicates, persists `email`, and deletes the Supabase auth user if profile creation fails (orphan prevention). `mapToResponseDto` returns the real `status`/`email`. `Profile` gained `status` (default `active`) and `email` (optional) columns. `request-context.middleware.ts` rejects requests from inactive profiles with 403.
  - **Security quick wins**: Removed silent Member auto-creation from GET handlers in `sermons.service.ts` and `pastoral.service.ts` (member creation now only happens on explicit writes via `ensureMemberId`). Added church-scoped member validation to `recordBulkAttendance`, pastoral `createNote`/`createLifeEvent`, giving `initializePayment`/`recordCashGiving`/`createRecurringGiving`, and admin `addDepartmentMember`/`addCellGroupMember`/`recordCellGroupAttendance`. Fixed WhatsApp check-in data-integrity bug where a Profile UUID was written into `attendance.member_id` (now resolves the Profile's `member_id`).
  - **Offline sync apply + bootstrap**: `SyncService.pushChanges` now applies each accepted change to the real tables (via `upsert` for create/update, church-scoped `deleteMany` for delete) inside a transaction and records it in the `SyncQueue` outbox so other clients can pull it. Added `GET /sync/bootstrap` returning a full camelCase snapshot of members, services, giving categories, visitors, attendance, and transactions plus a `revision` cursor for incremental syncs.
  - **Test infra**: Created `test/jest-e2e.json` (fixes the previously broken `npm run test:e2e` script). Sync spec updated with a transaction-aware Prisma mock and new tests for apply/upsert/delete/bootstrap.
  - **Tests**: 450 tests passing across 30 suites. Build clean, lint clean.

- **2026-07-24** — Template Publish Workflow.
  - **CreateTemplateDto**: Added optional `status` field (`draft` | `published`) so templates can be created in published state directly, eliminating the two-step create-then-update flow for ready templates.
  - **TemplatesService.publish()**: New dedicated method that transitions a draft template to published. Validates the template exists, belongs to the church, and is not already published or archived. Returns clear `BadRequestException` for invalid state transitions.
  - **Controller**: Added `POST /templates/:templateId/publish` endpoint with `church_admin`, `branch_pastor`, `secretary` role restrictions. Full Swagger documentation with 200/400/404 responses.
  - **Tests**: Added 5 new tests — default status on create, explicit published status on create, publish draft success, publish already-published rejection, publish archived rejection, publish non-existent rejection.

- **2026-07-22** — Backend Infrastructure Hardening (Tasks 1-5).
  - **Module Fix**: Added `AuthModule` import to `CustomFieldsModule` and `VisitorsModule` — fixes runtime crash where `JwtAuthGuard` couldn't resolve `JwksService` dependency.
  - **Connection Pooling**: Updated `PrismaService` to accept pool config via env vars (`DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECT_TIMEOUT_MS`). Uses `pg.PoolConfig` instead of raw connection string. Defaults: 10 max connections, 10s idle timeout.
  - **Migration CI/CD**: Added `deploy` job to `.github/workflows/ci.yml` — runs `npx prisma migrate deploy` on push to `main` after tests pass. Uses `DATABASE_URL` from GitHub Secrets.
  - **Database Functions**: New migration `20260722080000` adds:
    - `log_audit_event()` trigger — fires on INSERT/UPDATE/DELETE on `members`, `profiles`, `transactions` as a safety net alongside app-level AuditLoggingService.
    - `archive_old_attendance()` — moves attendance records older than 2 years to `attendance_archive` table.
    - `archive_old_messages()` — moves messages older than 1 year to `messages_archive` table.
  - **Partial Index**: `idx_risk_scores_high_risk` on `risk_scores(church_id, member_id, score) WHERE level IN ('high', 'critical')` — optimizes pastoral attention queries.
  - **ESLint Config**: Added `test/` to `tsconfig.eslint.json` include — fixes 33 parse errors for test files.
  - **Tests**: Build clean, lint clean (0 errors), **402 tests passing across 27 suites**.

- **2026-07-22** — Security Hardening + Quick Fixes (Day 1 Sprint).
  - **WhatsApp Webhook Security**: Added HMAC-SHA256 signature verification to `WhatsAppController.verifyWebhookSignature()` using `360DIALOG_WEBHOOK_SECRET`. Timing-safe comparison via `crypto.timingSafeEqual()`. Checks `x-hub-signature-256` header.
  - **Rate Limiting Overhaul**: Rewrote `RateLimitGuard` as global `APP_GUARD` in `app.module.ts`. Added `@SkipRateLimit()` decorator, `@RateLimit(config)` per-route decorator. `Ratelimit` instances cached in Map. Added `webhook` tier (500 req/min). Skipped on: WhatsApp webhook, Paystack/Flutterwave webhooks, Event webhooks, Health check, Forms public controller.
  - **RequestId in API Responses**: `LoggingInterceptor` generates UUID, stores on request. `ResponseInterceptor` reads it and includes `requestId` in `meta` field.
  - **Nightly Scheduler**: Created `NightlyScheduler` with `@nestjs/schedule` `Cron` decorator. Triggers at 2:00 AM Africa/Lagos daily, dispatches `run` job for each church.
  - **Health Check**: Fixed tag to `'Health'`, added broadcast queue to health check entries.
  - **Tests**: Build clean, lint clean. **414 tests passing across 28 suites**.

- **2026-07-22** — UsersModule (Day 2 Sprint).
  - **Module**: Created `src/users/` with `UsersModule`, `UsersController`, `UsersService`, DTOs.
  - **Endpoints** (7 under `/api/v1/users`):
    - `GET /users` — List church users with search/filter/sort
    - `GET /users/:userId` — Get single user details
    - `POST /users/invite` — Invite new user via Supabase Auth
    - `PATCH /users/:userId` — Update user profile
    - `POST /users/:userId/deactivate` — Deactivate user account
    - `POST /users/:userId/reset-password` — Send password reset link
    - `POST /users/:userId/force-signout` — Force sign-out via Supabase Auth
  - **Permissions**: Added `users` resource to RESOURCES array. `super_admin`/`senior_pastor`/`church_admin` get full access. `branch_pastor`/`secretary`/`treasurer`/`department_head` get read-only.
  - **Tests**: 12 unit tests passing. Total: **426 tests across 29 suites**.

- **2026-07-22** — NotificationsModule + SyncModule (Day 3 Sprint).
  - **NotificationsModule**: Created `src/notifications/` with controller, service, DTOs.
    - `GET /notifications` — List notifications with pagination
    - `GET /notifications/unread-count` — Get unread notification count
    - `PATCH /notifications/:notificationId/read` — Mark notification as read
    - `PATCH /notifications/read-all` — Mark all notifications as read
    - `createNotification()` / `broadcastToChurch()` — Internal service methods for other modules.
  - **SyncModule**: Created `src/sync/` with controller, service, DTOs.
    - `POST /sync/push` — Submit offline changes from mobile clients
    - `GET /sync/pull` — Get pending server changes with cursor pagination
    - `POST /sync/mark-synced` — Mark items as processed
    - Idempotency: checks entity_id + action before inserting.
    - Conflict resolution: last-write-wins based on clientTimestamp.
  - **Prisma Models**: Added `Notification`, `WebhookSubscription`, `WebhookDelivery` models. Migration `20260722090000_add_notifications_webhook_models`.
  - **Tests**: 8 NotificationsService + 7 SyncService tests. Total: **429 tests across 30 suites**. Build clean, lint clean.

- **2026-07-22** — Role Guards, Reports, Webhooks, Queue Hardening (Sprint Day 4).
  - **Phase 1 — Role Guards Fixed**: Added `RolesGuard` to `admin.controller.ts` (18 endpoints), `pastoral.controller.ts` (11 endpoints), `analytics.controller.ts` (6 endpoints). Added `@RequireRoles()` to all 6 mutating endpoints in `members.controller.ts`. All role-based access control now enforced at controller level.
  - **Phase 2 — ReportsModule**: Created `src/reports/` with `ReportsModule`, `ReportsService`, `ReportsController`, DTOs. 4 endpoints: `GET /reports/financial` (totals, category breakdown, monthly trends), `GET /reports/attendance` (total, per-service, monthly trends), `GET /reports/members` (status/gender breakdown, monthly growth), `POST /reports/export` (CSV). All queries use Prisma aggregations scoped by `church_id`. Registered in `app.module.ts`.
  - **Phase 3 — WebhooksModule**: Created `src/webhooks/` with `WebhooksModule`, `WebhooksService`, `WebhooksController`, `WebhookDeliveryProcessor`, DTOs. 5 endpoints: `POST /webhooks` (create subscription), `GET /webhooks` (list), `DELETE /webhooks/:id` (deactivate), `GET /webhooks/:id/deliveries` (history), `POST /webhooks/:id/test` (fire test). `notifySubscribers()` internal method for event dispatching. BullMQ `WebhookDeliveryProcessor` handles HMAC-SHA256 signed delivery with 3 retries, exponential backoff. Registered in `app.module.ts`.
  - **Phase 4 — Swagger Cleanup**: Eliminated 64 bare `@ApiProperty()` calls across 6 DTO files (`admin-response.dto.ts`, `broadcast-response.dto.ts`, `pastoral-note-response.dto.ts`, `life-event-response.dto.ts`, `family-response.dto.ts`, `template-response.dto.ts`). All now have proper `description` properties.
  - **Phase 5 — Queue Hardening**: Added `@OnQueueFailed` handler to `NightlyJobsProcessor`. Added `@OnQueueCompleted` handler to `RecurringGivingProcessor`. Created `DeadLetterProcessor` with `dead-letter` queue. Registered in `QueuesModule` with 7-day retention, graceful shutdown.
  - **Phase 6 — Lint Cleanup**: Fixed 8 `any` types in `scripts/delete-data.ts` — replaced with `Record<string, unknown>`, `{ id: string }[]`, and `PrismaClient` casts. ESLint disable directives for necessary dynamic Prisma model access.
  - **Phase 7 — Tests**: Added 7 `ReportsService` tests, 10 `WebhooksService` tests, 3 `DeadLetterProcessor` tests. Total: **436 tests across 31 suites**. Build clean, lint clean (0 errors, 0 warnings). All `@ApiProperty()` calls now have descriptions.
  - **Phase 9 — Wiring Fixes**: Added `dead-letter` and `webhook-delivery` queues to health check endpoint (all 8 queues now monitored). Imported `WebhooksModule` in `HealthModule`. Implemented `OnModuleDestroy` in `WebhooksModule` for graceful `webhook-delivery` queue shutdown on SIGTERM/SIGINT.

- **2026-07-21** — Completed Wave 9: Advanced Analytics & Reporting.
  - **Module**: Created `src/analytics/` with `AnalyticsModule`, `AnalyticsService`, `AnalyticsController`, and DTOs.
  - **Endpoints** (6 under `/api/v1/analytics`):
    - `GET /analytics/dashboard` — Unified overview (members, attendance, giving, risk, events, forms, engagement)
    - `GET /analytics/giving` — Totals, trends, category/branch/type breakdown, top donors, recurring summary
    - `GET /analytics/attendance` — Check-ins, sources, branch/service breakdown, first-time vs returning visitors, trends
    - `GET /analytics/members` — Demographics (status, gender, age groups), monthly growth
    - `GET /analytics/events` — Events summary, registrations, capacity, revenue, tier breakdown
    - `GET /analytics/communication` — Channel stats (sent/delivered/read/failed), broadcast summary
  - **DTOs**: 11 response DTOs + 2 query DTOs (date range, trend grouping)
  - **Tests**: Added `test/unit/analytics/analytics.service.spec.ts` with 7 tests. Total: **363 tests passing across 23 suites**. Build clean, lint clean (0 errors, 0 warnings).

- **2026-07-21** — Cleaned up seed data to use Prisma-generated UUIDs.
  - **Schema**: Extended `Form` with `is_template`, `is_public`, and `public_token`. Added `SubmissionStatus` enum. Extended `FormSubmission` with `church_id`, `status`, `approved_by_id`, `approved_at`, `rejection_reason`, and `attachments`. Migration: `add_form_submission_workflow`.
  - **Module**: Created `src/forms/` with `FormsModule`, `FormsService`, `FormsController`, `FormsPublicController`, and DTOs.
  - **Endpoints**: Authenticated CRUD for forms and submissions under `/api/v1/forms`, plus public submission endpoint `POST /forms/public/:publicToken/submit`.
  - **Features**: Field-definition form builder, submission validation, file attachments via `MediaAsset`, `pending → approved/rejected` workflow, template cloning, public anonymous submissions.
  - **Templates**: Added `prisma/seeds/form-templates.seed.ts` with 5 default templates and wired it into `prisma/seed.ts`.
  - **Tests**: Added `test/unit/forms/forms.service.spec.ts` with 26 tests. Total: **356 tests passing across 22 suites**. Build clean, lint clean (0 errors, 0 warnings).

- **2026-07-21** — Completed Wave 7: Asset & Inventory Management.
  - **Schema**: Refactored `Asset` model with structured fields (asset_tag, category relation, serial_number, brand, model, department/branch/custodian relations, condition, status, purchase details, depreciation config). Added `AssetCategory`, `AssetMaintenance`, `AssetDepreciation`, `AssetLoan`, and `AssetScanLog` models. Added enums `AssetStatus`, `AssetCondition`, `DepreciationMethod`, `MaintenanceStatus`, `AssetLoanStatus`. Migration: `20260721165046_add_asset_inventory_management`.
  - **Module**: Created `src/assets/` with `AssetsModule`, `AssetsService`, `AssetsController`, 17 DTOs, and barrel exports.
  - **Endpoints** (21 total under `/api/v1/assets`):
    - Categories: `POST /assets/categories`, `GET /assets/categories`, `PATCH /assets/categories/:categoryId`, `DELETE /assets/categories/:categoryId`
    - Assets: `POST /assets`, `GET /assets`, `GET /assets/:assetId`, `PATCH /assets/:assetId`, `DELETE /assets/:assetId`
    - Maintenance: `POST /assets/:assetId/maintenance`, `GET /assets/:assetId/maintenance`, `PATCH /assets/:assetId/maintenance/:maintenanceId`
    - Depreciation: `POST /assets/:assetId/depreciation`, `GET /assets/:assetId/depreciation`, `GET /assets/:assetId/depreciation/summary`
    - Loans: `POST /assets/:assetId/loans`, `GET /assets/:assetId/loans`, `PATCH /assets/:assetId/loans/:loanId/return`
    - QR & Scan: `POST /assets/:assetId/qr`, `GET /assets/:assetId/qr`, `POST /assets/scan`
  - **Features**:
    - Asset register with multi-tenant scoping, unique asset tags per church, search by name/tag/serial/location.
    - Maintenance scheduling with status tracking (scheduled, in_progress, completed, cancelled).
    - Depreciation tracking with straight-line and reducing-balance methods; yearly snapshots.
    - Loan tracking for members or external parties with return workflow.
    - QR code generation using `CHURCHOS:ASSET:<id>` format.
    - Scan workflow that logs scans and surfaces active loans/upcoming maintenance.
  - **Security**: All write endpoints protected by `JwtAuthGuard` + `RolesGuard`; role restrictions per endpoint. All mutations logged via `AuditLoggingService`.
  - **Tests**: Added `test/unit/assets/assets.service.spec.ts` with 20 tests. Total: **330 tests passing across 21 suites**. Build clean, lint clean (0 errors, 0 warnings).

- **2026-07-21** — Completed Wave 6: WhatsApp Templates + Broadcasts.
  - **6A WhatsApp Templates**: Extended `Template` model with WhatsApp-specific fields (`category`, `variables`, `external_id`, `external_status`). Updated `TemplatesService` and DTOs to support these fields. Added `WhatsAppService.sendTemplateMessage()` using 360dialog Cloud API template message format with variable interpolation. Added `POST /whatsapp/send-template` endpoint. Template must be `published` and channel-matched before use in broadcasts.
  - **6B Broadcasts**: Created `Broadcast` and `BroadcastRecipient` models with Prisma migration. Created `src/broadcast/` module with `BroadcastService`, `BroadcastController`, and DTOs. Added 4 endpoints: `POST /broadcasts`, `GET /broadcasts`, `GET /broadcasts/:broadcastId`, `PATCH /broadcasts/:broadcastId/cancel`. Implemented audience filtering by status, branch, gender, and search. Broadcasts enqueue messages to channel-specific outbound queues (`whatsapp-outbound`, `sms-outbound`, `email-outbound`). Created `BroadcastProcessor` and registered `broadcast` queue in `QueuesModule`. Wired `BroadcastModule` into `AppModule`.
  - Added 20 new tests: `test/unit/templates/templates.service.spec.ts` (4), `test/unit/broadcast/broadcast.service.spec.ts` (10), WhatsApp template/interpolation tests in `test/unit/whatsapp/whatsapp.service.spec.ts` (6). Total: **310 tests passing across 20 suites**. Build clean, lint clean (0 errors, 0 warnings).

- **2026-07-21** — Completed Wave 5: Recurring Giving + SMS Fallback.
  - **5A Recurring Giving (Automated Charges)**:
    - Extended `PaymentGatewayProvider` interface with `ChargeAuthorizationResult` and optional `chargeAuthorization()` method.
    - Implemented `PaystackService.chargeAuthorization()` calling Paystack `POST /transaction/charge_authorization` (Naira→Kobo conversion).
    - Extended `WebhookEvent` and `PaymentVerifyResult` to expose Paystack `authorization_code`.
    - Updated `GivingService.handleWebhook()` to capture `authorization_code` from `charge.success` events and store it on matching active `RecurringGiving` records.
    - Added recurring giving DTOs: `CreateRecurringGivingDto`, `RecurringGivingResponseDto`, `ListRecurringGivingDto`.
    - Added `GivingService` recurring methods: `createRecurringGiving()`, `listRecurringGiving()`, `getRecurringGivingById()`, `cancelRecurringGiving()`, `processRecurringCharge()`.
    - Added 4 controller endpoints: `POST /giving/recurring`, `GET /giving/recurring`, `GET /giving/recurring/:id`, `PATCH /giving/recurring/:id/cancel`.
    - Implemented `RecurringGivingProcessor` stub to delegate charges to `GivingService`.
    - Extended `NightlyJobsProcessor` to dispatch due recurring charges to the `recurring-giving` queue (query `is_active=true`, `authorization_code IS NOT NULL`, `next_charge_date <= now()`).
    - Wired `GivingModule` into `QueuesModule` imports (no circular dependencies).
    - Added 22 unit tests: `test/unit/giving/recurring-giving.service.spec.ts` (16) + `test/unit/queues/recurring-giving.processor.spec.ts` (2).
  - **5B SMS Fallback**:
    - Added `fallback_channel` and `parent_message_id` columns to `Message` model; created migration `20260721153657_add_sms_fallback_fields`.
    - Added `ENABLE_SMS_FALLBACK` env var (default `false`) to `env.validation.ts` and `.env.example`.
    - Extended `TermiiService.sendSms()` with optional `parentMessageId` parameter; fallback SMS messages are logged with `fallback_channel: 'sms'` and linked to the original WhatsApp message.
    - Updated `WhatsAppOutboundProcessor` to store the original WhatsApp message ID in job data on success, and trigger SMS fallback via `TermiiService` after all WhatsApp retries are exhausted (only when `ENABLE_SMS_FALLBACK=true`).
    - Added 5 unit tests: `test/unit/queues/whatsapp-outbound.processor.spec.ts`.
  - Prisma client regenerated, database migrated. Total: **288 tests passing across 18 suites**. Build clean, lint clean (0 errors, 0 warnings).

- **2026-07-21** — Removed step-number prefixes from all inline comments across 24 source files (422 occurrences). Comments now read as plain descriptions instead of numbered steps.

- **2026-07-21** — Fixed all ESLint warnings (51 → 0). Replaced `@typescript-eslint/no-explicit-any` across controllers (`req: any` → `AuthenticatedRequest`), services (Prisma types, typed params), DTOs (`Record<string, unknown>`), middleware (`SupabaseJwtPayload` cast), and tests (concrete mock data). 261 tests passing, build clean, lint clean (0 errors, 0 warnings).

- **2026-07-21** — Completed Wave 4: Pastoral Care, Engagement Scoring, Admin Dashboard.
  - **4A Pastoral Notes CRUD**: Created `src/pastoral/` module with AES-256-GCM encrypted content storage. Confidentiality-based access control (standard/confidential/restricted). Dual-authorization deletion for restricted notes. 5 endpoints.
  - **4B Engagement & Risk Scoring**: Created `ScoringService` with weighted scoring engines. Engagement: attendance (30%), giving (25%), events (20%), communication (15%), consistency (10%). Risk: attendance decline (25%), no giving (20%), no communication (20%), inactive status (15%), recent inactivity (20%). Nightly recalculation via BullMQ `nightly-jobs` processor.
  - **4C Life Event Tracking**: LifeEvent CRUD in PastoralService. Types: birthday, wedding, death, dedication, baptism, anniversary. Upcoming events endpoint for automated greetings. 5 endpoints.
  - **4D Department & Cell Group Management**: Created `src/admin/` module. Department CRUD with hierarchical structure and member assignments. Cell Group CRUD with geolocation. Haversine nearest-group recommendation endpoint. 14 endpoints.
  - **4E Admin Dashboard**: Dashboard endpoints: members needing attention, engagement distribution, rising stars, manual score recalculation.
  - Wired `NightlyJobsProcessor` to `ScoringService`. Added `PASTORAL_ENCRYPTION_KEY` env var. Registered `PastoralModule` + `AdminModule` in `app.module.ts`. 34 new tests. Total: 261 tests across 15 suites. Build clean, lint clean (0 errors, 0 warnings).

- **2026-07-21** — Completed Wave 3: Queue Integration, Paid Ticketing, DevOps Hardening.
  - **3E DevOps Hardening**: Fixed Redis URL (`host` → `url`, port 6379). Added `defaultJobOptions` (3 attempts, exponential backoff 5s, TTLs) to all 5 BullMQ queues. Enhanced health endpoint with per-queue metrics. Added graceful queue shutdown via `OnModuleDestroy`.
  - **3A WhatsApp Queue Integration**: `WhatsAppOutboundProcessor` now calls `WhatsAppService.sendMessage()`. Added `@OnQueueCompleted`/`@OnQueueFailed` handlers.
  - **3B Resend Email Service**: Created `src/communication/resend.service.ts` (Resend API wrapper, Message table logging). Created `CommunicationModule`. Wired `EmailOutboundProcessor`. Added `RESEND_FROM` env var.
  - **3C Termii SMS Service**: Created `src/communication/termii.service.ts` (Termii API wrapper, Message table logging). Wired `SmsOutboundProcessor`. Added `TERMII_FROM` env var.
  - **3D Paid Ticketing**: Prisma schema: `TicketStatus`/`RegistrationPaymentStatus` enums, `EventTicketTier` model, extended `EventRegistration`/`Ticket`, nullable `Transaction.category_id`. EventsService: free/paid registration branching, `confirmTicketPayment()`, `validateTicket()`, `createTicketTier()`. New endpoints: `POST /events/:eventId/tiers`, `POST /events/:eventId/tickets/validate`, `POST /events/:eventId/webhook/paystack`. Exported `PAYMENT_GATEWAY_REGISTRY` from GivingModule. 227 tests passing, build clean.

- **2026-07-21** — Fixed Swagger `$ref` resolution errors for paginated response DTOs.
  - **Root cause:** `ApiPaginatedResponse` used `getSchemaPath(itemClass)` to generate `$ref` strings but never registered the DTO class as an OpenAPI schema via `ApiExtraModels`.
  - Added `ApiExtraModels(itemClass)` to the decorator in `src/common/decorators/api-paginated.decorator.ts`. This registers each DTO in `components.schemas`, making all `$ref` paths resolve correctly.
  - Fixes: `BranchResponseDto`, `EventResponseDto`, `MemberResponseDto`, `SermonResponseDto`, `MediaAssetResponseDto`.

- **2026-07-20** — Completed ProfileModule (Phase 1).
  - Created `src/profile/` — ProfileModule with ProfileService, ProfileController, and 4 DTOs.
    - `GET /profiles/me` — Get current user's full profile with church and branch details.
    - `PATCH /profiles/me` — Update own profile (firstName, lastName, phone) with partial updates.
    - `POST /profiles/me/photo` — Upload profile photo via MediaService (Supabase Storage + sharp optimization). Deletes previous avatar.
    - `GET /profiles` — List all profiles with pagination, search (name/phone), role filter, branch filter, sortable columns.
    - `GET /profiles/:profileId` — Get profile by ID (same-church access).
    - `PATCH /profiles/:profileId/role` — Update user role (admin only). 9 valid roles. Prevents self-demotion and super_admin modification.
    - `DELETE /profiles/:profileId` — Soft-delete profile (admin only). Prevents self-deactivation.
  - Migrated `getProfile()` and `updateProfile()` from `AuthService` to `ProfileService`.
  - Removed `GET /auth/me` and `PATCH /auth/me` endpoints from AuthController (now at `/api/v1/profiles/me`).
  - Registered `ProfileModule` in `app.module.ts` (imports AuthModule + MediaModule).
  - 23 new unit tests: `test/unit/profile/profile.service.spec.ts`.
  - Build clean, lint clean, all tests passing.

- **2026-07-20** — Completed GivingModule (Phase 1).
  - Created `src/giving/` — GivingModule with GivingService, GivingController, PaystackService, FlutterwaveService, ReceiptService, and 8 DTOs.
    - `POST /giving/categories` — Create giving category (admin only). Validates name uniqueness within church.
    - `GET /giving/categories` — List categories with optional isActive filter. Ordered by display_order.
    - `GET /giving/categories/:categoryId` — Get single category by ID (same-church).
    - `PATCH /giving/categories/:categoryId` — Update category (admin only). Validates name uniqueness on rename.
    - `DELETE /giving/categories/:categoryId` — Deactivate category (admin only). Soft-delete only.
    - `POST /giving/initialize` — Initialize digital payment (Paystack or Flutterwave). Creates pending transaction, returns authorization URL.
    - `GET /giving/verify/:reference` — Verify payment via gateway API. Updates transaction status.
    - `POST /giving/webhook/paystack` — Paystack webhook handler. Validates HMAC-SHA512 `x-paystack-signature`. Idempotent for terminal states.
    - `POST /giving/webhook/flutterwave` — Flutterwave webhook handler. Validates HMAC-SHA512 `verif-hash` header.
    - `POST /giving/cash` — Record cash/bank transfer giving (admin/secretary/treasurer). Auto-generates receipt number.
    - `GET /giving/transactions` — List transactions with pagination, category/member/status/type/date/gateway filters, sorting.
    - `GET /giving/transactions/:transactionId` — Get transaction details (same-church).
    - `GET /giving/transactions/:transactionId/receipt` — Download PDF receipt (only for successful transactions).
  - Created `src/giving/services/payment-gateway.interface.ts` — `PaymentGatewayProvider` interface, `PaymentInitializeResult`, `PaymentVerifyResult`, `WebhookEvent` types.
  - Created `src/giving/services/flutterwave.service.ts` — Flutterwave v3 API: initialize (Naira, no conversion), verify by `tx_ref`, webhook HMAC-SHA512 via `verif-hash` header, status/channel mapping.
  - Refactored `src/giving/services/paystack.service.ts` — implements `PaymentGatewayProvider` interface. Naira→Kobo conversion, `x-paystack-signature` webhook validation.
  - Created `src/giving/services/receipt.service.ts` — PDF receipt generation with PDFKit. Receipt numbers: `{YEAR}/{PREFIX}/{SEQUENTIAL}` (e.g. `2026/TIT/0001`).
  - Refactored `src/giving/giving.service.ts` — injected `Map<string, PaymentGatewayProvider>` registry instead of `PaystackService`. Added `resolveGateway()`, `getDefaultGateway()`. Default gateway from Church config `default_payment_gateway`, falls back to `'paystack'`.
  - Updated `src/giving/giving.module.ts` — registered FlutterwaveService, added `PAYMENT_GATEWAY_REGISTRY` factory provider.
  - Added `PaymentGateway` enum and `payment_gateway` field (default: `paystack`) to Prisma `Transaction` model.
  - Installed `pdfkit` + `@types/pdfkit`.
  - Registered `GivingModule` in `app.module.ts`.
  - Added 7th seed category: Welfare/Mission. Updated seed transactions with `payment_gateway` field.
  - 38 GivingService + 14 FlutterwaveService unit tests (52 giving tests, 167 total).
  - Build clean, lint clean, all tests passing.

- **2026-07-21** — Completed EventsModule, SermonsModule, MediaLibrary, WhatsAppModule (Phase 1).
  - Created `src/events/` — EventsModule with EventsService, EventsController, and 6 DTOs.
    - `POST /events` — Create event (church_admin, branch_pastor).
    - `GET /events` — List events with type/status/date filters, pagination.
    - `GET /events/:eventId` — Get single event.
    - `PATCH /events/:eventId` — Update event (church_admin, branch_pastor).
    - `DELETE /events/:eventId` — Delete event (church_admin).
    - `POST /events/:eventId/register` — Register member for event (capacity + duplicate checks).
    - `DELETE /events/:eventId/register/:memberId` — Cancel registration.
  - Created `src/sermons/` — SermonsModule with SermonsService, SermonsController, and 4 DTOs.
    - `POST /sermons` — Create sermon record (church_admin, branch_pastor).
    - `GET /sermons` — List sermons with speaker/series/tag/search filters, date range, pagination.
    - `GET /sermons/:sermonId` — Get single sermon.
    - `PATCH /sermons/:sermonId` — Update sermon (church_admin, branch_pastor).
    - `DELETE /sermons/:sermonId` — Delete sermon (church_admin).
    - `setAudioUrl()` — Set audio URL after Supabase Storage upload.
  - Extended `src/media/` — MediaAsset library browsing with folder/MIME/permission filtering.
    - `GET /media/library` — List media assets with folder, MIME type, permission, search filters.
    - `GET /media/library/folders` — Get unique folder names.
    - `GET /media/library/:assetId` — Get single asset.
    - `PATCH /media/library/:assetId/permissions` — Update permissions (church_admin).
    - `DELETE /media/library/:assetId` — Delete asset from DB + Supabase Storage (church_admin).
    - `MediaAsset` records now created on every upload (image and file).
  - Created `src/whatsapp/` — WhatsAppModule with WhatsAppService, WhatsAppController, and 3 DTOs.
    - `GET /whatsapp/webhook` — Webhook verification (360dialog challenge-response).
    - `POST /whatsapp/webhook` — Inbound message + status update processing.
    - `POST /whatsapp/send` — Send outbound message (authenticated).
    - `GET /whatsapp/messages` — List messages with phone/direction filters, pagination.
    - Command router with 6 handlers: HELP, CHECKIN, GIVE, PRAYER, EVENTS, STATUS.
    - CHECKIN: finds today's service by `day_of_week`, prevents duplicate check-ins, records via Attendance model.
    - GIVE: returns giving link from ChurchConfig or WEB_URL.
    - PRAYER: logs prayer request via AuditLoggingService.
    - EVENTS: lists next 5 upcoming events.
    - STATUS: shows 30-day attendance count and giving total.
    - Outbound messaging via 360dialog Cloud API (`WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`).
    - All messages logged to `Message` model with `MessageDirection` enum (inbound/outbound).
  - Added Prisma `Sermon` and `MediaAsset` models with migration.
  - Registered all new modules in `app.module.ts` (EventsModule, SermonsModule, WhatsAppModule).
  - 20 EventsService + 12 SermonsService + 10 MediaService (library) + 15 WhatsAppService unit tests.
  - Total: 227 tests passing across 12 suites. Build clean, lint clean.

- **2026-07-19** — Fixed Prisma orderBy validation error in branch listing.
  - **Root cause:** `BranchesService.findAll()` passed `orderBy` as a single object (`{ is_headquarters: 'desc', name: 'asc' }`), but Prisma 7 expects an array (`BranchOrderByWithRelationInput[]`).
  - Changed `orderBy` type from `Prisma.BranchOrderByWithRelationInput` to `Prisma.BranchOrderByWithRelationInput[]`.
  - Default sort is now `[{ is_headquarters: 'desc' }, { name: 'asc' }]`.
  - Custom `sortBy` pushes a single sort criterion into the array.
  - Fixed in `src/branches/branches.service.ts:117-123`.

- **2026-07-19** — Improved staff invitation error handling.
  - Supabase invite errors now surface the actual error message in the API response instead of a generic "Failed to send staff invitation".
  - Helps diagnose Supabase configuration issues (e.g. invalid email, SMTP not configured).
  - Changed in `src/church/church.service.ts:255`.

- **2026-07-19** — Completed Members module and created Attendance module.
  - **Members module**: Full CRUD, search, bulk import (CSV/XLSX), export, QR code generation, giving/attendance history, admin notes. Fixed `orderBy` array pattern for Prisma 7 compatibility.
  - **Attendance module**: Created `src/attendance/` with AttendanceModule, AttendanceService, AttendanceController, and 6 DTOs.
    - Service CRUD: `POST /services`, `GET /services`, `GET /services/:id`, `PATCH /services/:id`.
    - Attendance recording: `POST /attendance`, `POST /attendance/bulk`, `POST /attendance/visitor`.
    - Analytics: `GET /attendance/summary`, `GET /attendance/trends`, `GET /attendance/by-service/:id`.
    - Duplicate check-in prevention via `@@unique([service_id, member_id])`.
    - All queries scoped by `church_id` for multi-tenant isolation.
  - Registered `AttendanceModule` in `app.module.ts`.

- **2026-07-19** — Renamed generic `:id` route parameters to descriptive names across all controllers.
  - `attendance.controller.ts`: `:id` → `:serviceId` (2 routes).
  - `members.controller.ts`: `:id` → `:memberId` (7 routes).
  - `branches.controller.ts`: `:id` → `:branchId` (3 routes).
  - `church.controller.ts`: `staff/:id` → `staff/:profileId` (2 routes).
  - Improves Swagger documentation clarity by showing which entity ID each endpoint expects.
  - Build compiles cleanly.

- **2026-07-17** — Completed Church, Branch, and Media modules (Phase 1).
  - Created `src/church/` — ChurchModule with ChurchService, ChurchController.
    - GET/PATCH /church — Church details CRUD with partial updates.
    - GET/PATCH /church/config — Church configuration key-value management.
    - POST /church/invite — Staff invitation via Supabase admin invite API.
    - GET /church/staff — Paginated staff listing with search/filter.
    - PATCH /church/staff/:id/role — Update staff role.
    - DELETE /church/staff/:id — Soft-delete staff (role set to "removed").
    - Image optimization: deletes old logo from Supabase Storage when replaced.
  - Created `src/branches/` — BranchesModule with BranchesService, BranchesController.
    - POST /branches — Create branch (validates single headquarters).
    - GET /branches — Paginated branch list with search/sort.
    - GET /branches/:id — Get single branch with member count.
    - PATCH /branches/:id — Update branch (deletes old photo on replacement).
    - DELETE /branches/:id — Delete branch (blocked if members exist).
  - Created `src/media/` — MediaModule with MediaService, MediaController.
    - POST /media/upload/image — Upload image with sharp optimization (WebP, 1200px, Q80).
    - POST /media/upload — Upload file without optimization.
    - DELETE /media/:path — Delete file from Supabase Storage.
    - Image optimization pipeline: sharp → resize (max 1200×1200, inside fit) → webp (quality 80) → strip metadata.
  - Added `photo_url` field to Branch model, `avatar_url` field to Profile model.
  - Installed `sharp` (image processing), `@types/multer`, `@types/uuid`.
  - Added `esModuleInterop: true` to tsconfig.json for proper ESM/CJS interop.
  - Added `SUPABASE_STORAGE_BUCKET` and `MAX_FILE_SIZE_MB` to env validation.
  - Updated `app.module.ts` to import MediaModule, ChurchModule, BranchesModule.
  - Updated `src/main.ts` compression import to use default import (esModuleInterop).
  - Created 28 new unit tests (84 total, up from 56).
  - All tests passing, build clean, lint clean.
  - Added comprehensive JSDoc comments to all 25 new source files across media, church, and branches modules (file headers, class docs, method params/returns/throws).
  - Verified UUID usage: all IDs come from Prisma `@default(uuid())`, no manual UUID generation for DB IDs, all test fixture IDs use UUID format.

- **2026-07-14** — Initial NestJS project setup with TypeScript strict mode.
  - Created `package.json` with NestJS core, Prisma, Swagger, class-validator deps.
  - Configured `tsconfig.json` with strict mode and all strict flags enabled.
  - Configured `nest-cli.json` for build settings.
  - Set up `.eslintrc.js` with TypeScript-ESLint + Prettier integration.
  - Set up `.prettierrc` with project formatting rules.
  - Created `src/main.ts` with bootstrap: ValidationPipe, CORS, Swagger at `/api/v1/docs`.
  - Created `src/app.module.ts` with ConfigModule (global) + PrismaModule (global).
  - Created `src/prisma/prisma.service.ts` — PrismaService with lifecycle hooks and logging.
  - Created `src/prisma/prisma.module.ts` — Global PrismaModule.
  - Created `src/prisma/index.ts` — Barrel exports.
  - Fixed 4 Prisma schema validation errors (missing back-relations, @unique constraint).
  - Verified `npx nest build` compiles with zero errors.
  - Added JSDoc documentation and step-by-step comments to all source files.
  - Created this `AGENTS.md` file.

- **2026-07-14** — Changed PostgreSQL host port from 5432 to 5433 in `docker-compose.yml` to avoid conflict with existing PostgreSQL installation. Updated `DATABASE_URL` in `.env.example` to match.
- **2026-07-14** — Created `prisma.config.ts` for Prisma 7 compatibility. Prisma 7 requires the database URL to be configured here instead of in `schema.prisma`. Installed `dotenv` for `.env` variable loading.
- **2026-07-14** — Fixed TypeScript build: excluded `prisma.config.ts` from `tsconfig.build.json`, removed deprecated `ignoreDeprecations: "6.0"` from `tsconfig.json` (incompatible with TypeScript 5.6+).
- **2026-07-14** — Fixed ESLint parsing error for `prisma.config.d.ts` (Prisma 7 generated file). Removed deprecated `baseUrl` from `tsconfig.json`, updated `paths` to use relative `"./src/*"`. Added `prisma.config.ts` and `prisma.config.d.ts` to ESLint ignorePatterns.
- **2026-07-15** — Enhanced Swagger/OpenAPI documentation setup (Task #5).
  - Enhanced `DocumentBuilder` configuration with detailed API description, contact, and license info.
  - Added named Bearer Auth scheme `supabase-auth` with full configuration.
  - Added `deepScanRoutes` and `persistAuthorization` Swagger UI options.
  - Created `src/common/decorators/` with reusable Swagger decorators:
    - `ApiPaginatedResponse()` — Standard paginated response wrapper with query params.
    - `ApiCreateEndpoint()` — Standard CRUD create documentation.
    - `ApiListEndpoint()` — Standard CRUD list documentation.
    - `ApiGetEndpoint()` — Standard CRUD single-item documentation.
    - `ApiUpdateEndpoint()` — Standard CRUD update documentation.
    - `ApiDeleteEndpoint()` — Standard CRUD delete documentation.
    - `CurrentUser()` — Parameter decorator for authenticated user.
    - `CurrentUserProfile()` — Parameter decorator for user's church profile.
- **2026-07-15** — Added environment validation with Zod (Task #6).
  - Installed `zod` for runtime schema validation.
  - Created `src/config/env.validation.ts` with full Zod schema for all env vars.
  - Required vars: `NODE_ENV`, `PORT`, `WEB_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `REDIS_URL`.
  - Optional vars: `PAYSTACK_*`, `FLUTTERWAVE_SECRET_KEY`, `360DIALOG_*`, `RESEND_API_KEY`, `TERMII_API_KEY`, `OPENAI_API_KEY`.
  - Updated `src/main.ts` to import and validate env vars at startup before any other code runs.
  - Application fails fast with descriptive error messages if required vars are missing.
- **2026-07-15** — Added global exception filter (Task #7).
  - Created `src/common/filters/global-exception.filter.ts` with standardized error responses.
  - Handles: HttpException, ZodError, Prisma errors (P2002, P2025, P2003, P2014), generic errors.
  - Returns consistent error format: `{ success, error: { code, message, details, timestamp, path, method } }`.
  - Registered globally in `main.ts` via `app.useGlobalFilters()`.
- **2026-07-15** — Created seed data script (Task #2 — continued).
  - Created `prisma/seed.ts` with development data.
  - Seeds: 1 church, 1 branch, 6 giving categories, 2 services, 10 members, 1 admin profile, 3 transactions.
  - Added `tsconfig.seed.json` for seed file compilation.
  - Excluded `prisma/` from main build to avoid rootDir conflicts.
  - Run with `npx prisma db seed`.

- **2026-07-15** — Added request logging and audit logging (Task #8).
  - Created `src/common/interceptors/logging.interceptor.ts` — logs method, URL, status, duration, IP, user agent, request ID.
  - Created `src/common/services/audit-logging.service.ts` — records data mutations to `audit_logs` table.
  - Created `src/common/common.module.ts` — global module providing AuditLoggingService.
  - Registered LoggingInterceptor globally in `main.ts`.

- **2026-07-15** — Added Supabase Auth module and JWT guard (Task #9).
  - Created `src/supabase/` — SupabaseService + global SupabaseModule.
  - Created `src/auth/strategies/jwt.strategy.ts` — Passport JWT strategy for Supabase tokens.
  - Created `src/auth/guards/jwt-auth.guard.ts` — JWT validation guard.
  - Created `src/auth/auth.module.ts` — Passport + JWT strategy registration.
  - Added `SUPABASE_JWT_SECRET` to env validation and `.env.example`.
  - Installed `@supabase/supabase-js`, `@nestjs/passport`, `passport`, `passport-jwt`.

- **2026-07-15** — Added RBAC decorators and guard (Task #10).
  - Created `src/auth/decorators/roles.decorator.ts` — `@RequireRoles()` decorator.
  - Created `src/auth/guards/roles.guard.ts` — checks user role from Profile model.

- **2026-07-15** — Created production Dockerfile (Task #11).
  - Multi-stage build: deps → prisma generate → build → production runner.
  - Non-root user (churchos:1001).
  - Created `.dockerignore`.

- **2026-07-15** — Created GitHub Actions CI/CD workflow (Task #12).
  - Created `.github/workflows/ci.yml` — lint, build, test with PostgreSQL service container.

- **2026-07-15** — Added response interceptor (Phase 0 remaining).
  - Created `src/common/interceptors/response.interceptor.ts` — wraps all responses in `{ success, data, meta }`.
  - Supports paginated responses with `total`, `page`, `limit`, `totalPages` in meta.
  - Registered globally in `main.ts`.

- **2026-07-15** — Added Redis module (Phase 0 remaining).
  - Created `src/redis/redis.service.ts` — Upstash Redis client with convenience methods.
  - Created `src/redis/redis.module.ts` — global RedisModule.
  - Installed `@upstash/redis`.

- **2026-07-15** — Added health check endpoint (Phase 0 remaining).
  - Created `src/health/health.controller.ts` — `GET /health` checks database + Redis.
  - Returns `{ status, timestamp, uptime, services: { database, redis } }`.

- **2026-07-15** — Added Sentry error tracking (early setup).
  - Installed `@sentry/nestjs`, `@sentry/profiling-node`.
  - Created `src/common/interceptors/sentry.interceptor.ts` — captures exceptions with context.
  - Added `SENTRY_DSN` to env validation (optional).
  - Sentry only activates when `SENTRY_DSN` is set.

- **2026-07-15** — Added rate limiting (early setup).
  - Installed `@upstash/ratelimit`.
  - Created `src/common/guards/rate-limit.guard.ts` — sliding window rate limiter.
  - Created `@RateLimit()` decorator for per-route custom limits.
  - Default: 100 req/min, Auth: 10 req/min, Sensitive: 5 req/min.

- **2026-07-15** — Added Helmet security headers and compression (early setup).
  - Installed `helmet`, `compression`.
  - Added `app.use(helmet())` and `app.use(compression())` in `main.ts`.

- **2026-07-15** — Added graceful shutdown hooks (early setup).
  - Added `app.enableShutdownHooks()` in `main.ts`.
  - Ensures Prisma, Redis disconnect cleanly on SIGTERM/SIGINT.

- **2026-07-15** — Set up Jest test infrastructure (Phase 1).
  - Created `jest.config.ts` with `ts-jest` preset, `@/` path aliases, coverage thresholds.
  - Added `jest` to `tsconfig.json` types array.
  - Excluded `jest.config.ts` from `tsconfig.build.json`.
  - Created `test/helpers/prisma-mock.helper.ts` — generic Proxy-based Prisma mock factory.
  - Created `test/helpers/test-app.helper.ts` — NestJS test app builder with production-like config.
  - Created `test/fixtures/` — mock data for churches, branches, members, profiles, users.

- **2026-07-15** — Added RequestContext middleware + service (Phase 1).
  - Created `src/common/services/request-context.service.ts` — AsyncLocalStorage-based tenant context.
  - Created `src/common/middleware/request-context.middleware.ts` — extracts userId, churchId, branchId, role from JWT.
  - Registered middleware in `CommonModule` via `NestModule.configure()`.
  - 11 unit tests passing: `test/unit/common/request-context.service.spec.ts`.

- **2026-07-15** — Completed Auth module (Phase 1).
  - Created `src/auth/dto/register.dto.ts` — registration DTO with class-validator decorators.
  - Created `src/auth/dto/auth-response.dto.ts` — RegisterResponseDto, ProfileResponseDto.
  - Created `src/auth/auth.service.ts` — register (Supabase + Prisma transaction), getProfile.
  - Created `src/auth/auth.controller.ts` — POST /auth/register (public), GET /auth/me (protected).
  - Updated `src/auth/auth.module.ts` — imports SupabaseModule, registers AuthService + AuthController.
  - 8 unit tests passing: `test/unit/auth/auth.service.spec.ts`.

- **2026-07-15** — Fixed TypeScript/ESLint config for test files.
  - `tsconfig.json` is now the base config: no `rootDir`, includes both `src/` and `test/`.
  - `tsconfig.build.json` extends base, adds `rootDir: "./src"`, excludes `test/` + specs.
  - `.eslintrc.js` points to `tsconfig.json` directly (removed `tsconfig.eslint.json`).
  - All 19 tests pass, build compiles clean, lint passes with zero errors.

- **2026-07-15** — Rewrote Redis module for local dev + cloud support.
  - Installed `ioredis` for local Redis (`redis://`) alongside `@upstash/redis` for cloud (`https://`).
  - Rewrote `RedisService` to auto-detect URL scheme and use appropriate client.
  - Updated `env.validation.ts`: `REDIS_URL` accepts both `redis://` and `https://`, added optional `UPSTASH_REDIS_TOKEN`.
  - Updated `HealthController` to use `redis.ping()` instead of `redis.client.ping()`.
  - Updated `RateLimitGuard` to skip when using `ioredis` (requires Upstash).

- **2026-07-15** — Fixed `compression` import in `main.ts`.
  - Changed `import compression from 'compression'` to `import * as compression from 'compression'` (CommonJS compat).

- **2026-07-16** — Completed Auth module (Phase 1).
  - Created `src/auth/dto/login.dto.ts` — LoginDto with email/password validation.
  - Created `src/auth/dto/forgot-password.dto.ts` — ForgotPasswordDto with email validation.
  - Created `src/auth/dto/reset-password.dto.ts` — ResetPasswordDto with token + newPassword.
  - Created `src/auth/dto/change-password.dto.ts` — ChangePasswordDto with currentPassword + newPassword.
  - Created `src/auth/dto/update-profile.dto.ts` — UpdateProfileDto with optional firstName, lastName, phone.
  - Created `src/auth/dto/session-response.dto.ts` — LoginResponseDto, RefreshResponseDto.
  - Added `login()` method — Supabase signInWithPassword, profile lookup, audit log, returns tokens.
  - Added `logout()` method — token blacklist in Redis, audit log.
  - Added `forgotPassword()` method — Supabase resetPasswordForEmail, always returns success (prevents email enumeration).
  - Added `resetPassword()` method — Supabase updateUser with recovery token.
  - Added `changePassword()` method — verify current password, then update via Supabase.
  - Added `updateProfile()` method — partial updates to Profile record in Prisma, audit log.
  - Added `refreshSession()` method — Supabase refreshSession, returns new tokens.
  - Added 7 new controller endpoints: POST login, POST logout, POST forgot-password, PATCH reset-password, PUT password, PATCH me, POST refresh.
  - Updated `src/auth/index.ts` barrel exports for all new DTOs.
  - Updated `src/auth/auth.service.ts` — added RedisService and ConfigService dependencies.
  - Updated tests: 37 tests passing (was 19).
  - All new tests cover success paths and error paths for every method.

- **2026-07-16** — Fixed JWT verification for Supabase ES256 tokens.
  - **Root cause:** Supabase now signs JWTs with ES256 (asymmetric ECDSA), not HS256 (symmetric HMAC). The old `passport-jwt` strategy only supported HS256 verification.
  - Installed `jose` library for JWKS-based JWT verification.
  - Created `src/auth/services/jwks.service.ts` — fetches & caches Supabase's public keys from `/.well-known/jwks.json` with automatic key rotation.
  - Rewrote `src/auth/guards/jwt-auth.guard.ts` — standalone NestJS guard using `jose.jwtVerify()` via JWKS. No longer depends on Passport.
  - Stripped Passport from `src/auth/auth.module.ts` — removed `PassportModule`, `JwtStrategy`. Auth module now registers `JwksService` + `JwtAuthGuard` directly.
  - Converted `src/auth/strategies/jwt.strategy.ts` to type-only file exporting `SupabaseJwtPayload`.
  - Made `SUPABASE_JWT_SECRET` optional in `src/config/env.validation.ts` (no longer used for verification).
  - Updated `src/common/decorators/current-user.decorator.ts` — `SupabaseUser` is now a type alias for `SupabaseJwtPayload` (includes both `id` and `sub`).
  - Updated `src/auth/guards/roles.guard.ts`, `src/common/interceptors/sentry.interceptor.ts` — replaced Passport `Request` types with `AuthenticatedRequest`.
  - 37 tests passing, build clean, lint clean.
