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
├── queues/                 # BullMQ queue infrastructure, 6 named queues, processors
│   ├── queues.module.ts    # BullModule config, Redis connection, graceful shutdown
│   └── processors/         # WhatsApp, Email, SMS, RecurringGiving, NightlyJobs processors
├── pastoral/               # Pastoral notes (AES-256-GCM), life events, engagement & risk scoring
│   ├── pastoral.service.ts # CRUD + encryption + confidentiality access control
│   ├── scoring.service.ts  # Engagement & risk score calculation engines
│   └── dto/                # CreatePastoralNote, LifeEvent, List DTOs
├── admin/                  # Department CRUD, cell group CRUD, dashboard endpoints
│   ├── admin.service.ts    # Department/CellGroup CRUD, Haversine nearest-group
│   └── dto/                # CreateDepartment, CreateCellGroup, Response DTOs
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
